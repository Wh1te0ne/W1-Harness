/** Queue completed package bundles; swap whole output directories only before starting a stopped W1. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const journalName = 'apply-journal.json'
const previousSuffix = '.w1-prev'
const nextSuffix = '.w1-next'

const stateDirectory = root => join(root, '.work/local-dev')
const queueDirectory = root => join(stateDirectory(root), 'pending-builds')
const artifactDirectory = root => join(stateDirectory(root), 'pending-artifacts')
const journalPath = root => join(queueDirectory(root), journalName)
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const pathKey = path => process.platform === 'win32' ? path.toLowerCase() : path
const validTarget = target => /^packages[/][a-z0-9-]+[/][a-z0-9-]+$/u.test(target)
  || target === 'apps/desktop' || target === 'apps/desktop-host' || target === 'apps/web'
function inside(base, path) {
  const resolved = resolve(base, path)
  if (!resolved.startsWith(resolve(base) + sep)) throw new Error('Pending build path escapes its directory')
  return resolved
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Pending builds cannot contain links')
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}
const sequence = destination => ({
  destination,
  previous: destination + previousSuffix,
  next: destination + nextSuffix,
})
function checkedPath(root, path) {
  const absolute = inside(root, relative(root, path))
  let cursor = resolve(root)
  for (const part of relative(root, absolute).split(sep)) {
    cursor = join(cursor, part)
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Pending build path contains a link')
  }
  return absolute
}
const discard = (root, path) => rmSync(checkedPath(root, path), { recursive: true, force: true })
const outputDirectory = (root, target) => checkedPath(root, join(root, target, target === 'apps/web' ? 'dist' : 'lib'))
function writeJournal(root, journal) {
  mkdirSync(queueDirectory(root), { recursive: true })
  const temporary = journalPath(root) + '.' + process.pid + '.tmp'
  writeFileSync(temporary, JSON.stringify(journal) + '\n')
  renameSync(temporary, journalPath(root))
}

/**
 * Return every destination to its last committed directory and drop staging left by an interrupted publication.
 * @param {string} root Repository root holding the queue.
 * @returns {number} Count of destinations that had been swapped before the interruption.
 */
function recoverOwnedBuilds(root, isRunning) {
  const journal = journalPath(root)
  if (!existsSync(journal)) return 0
  if (isRunning()) throw new Error('Exit W1 before recovering pending development builds')
  let recorded
  try {
    recorded = JSON.parse(readFileSync(journal, 'utf8'))
  } catch {
    throw new Error('Pending build journal is unreadable: ' + journal)
  }
  if (recorded.version !== 1 || !Array.isArray(recorded.batches)
    || !['validated', 'swapped', 'committed'].includes(recorded.state)) throw new Error('Invalid pending build journal')
  const batches = recorded.batches.map(batch => {
    if (!validTarget(batch.target)) throw new Error('Invalid recovery target')
    const expected = outputDirectory(root, batch.target)
    if (resolve(root, batch.destination) !== expected) throw new Error('Recovery destination escapes its target')
    for (const path of Object.values(sequence(expected))) checkedPath(root, path)
    return batch
  })
  const committed = recorded.state === 'committed'
  let rolledBack = 0
  for (const batch of [...batches].reverse()) {
    const paths = sequence(resolve(root, batch.destination))
    if (!committed && existsSync(paths.previous)) {
      discard(root, paths.destination)
      renameSync(paths.previous, paths.destination)
      rolledBack += 1
    } else if (!committed && batch.existed === false) {
      discard(root, paths.destination)
    }
    discard(root, paths.previous)
    discard(root, paths.next)
  }
  unlinkSync(journal)
  return rolledBack
}

/** Publish a queue record only after a successful build; incomplete outputs remain unreachable. */
export function queuePackageBuild(root, target, output) {
  if (!validTarget(target)) throw new Error('Expected a package or desktop application target')
  const stage = inside(artifactDirectory(root), relative(artifactDirectory(root), output))
  const entries = files(stage).map(file => ({ file: relative(stage, file), sha256: hash(file) }))
  if (!entries.length) throw new Error('Pending build is empty')
  mkdirSync(queueDirectory(root), { recursive: true })
  const manifest = join(queueDirectory(root), target.replaceAll('/', '-') + '.json')
  const temporary = manifest + '.' + process.pid + '.tmp'
  writeFileSync(temporary, JSON.stringify({ target, stage: relative(root, stage), entries }) + '\n')
  renameSync(temporary, manifest)
}

/**
 * Validate every queued byte, then swap each output directory as a unit while recording how to undo it.
 * A failure restores the previously committed directories and keeps the queue for retry, so W1 never starts
 * on a mixture of old and new build output.
 * @param {string} root Repository root holding the queue.
 * @param {() => boolean} isRunning Reports whether the application using these outputs is still running.
 * @returns {number} Count of destinations published from the queue.
 */
function publishOwnedBuilds(root, isRunning, progress) {
  recoverOwnedBuilds(root, isRunning)
  const queue = queueDirectory(root)
  if (!existsSync(queue)) return 0
  const manifests = readdirSync(queue).filter(name => name.endsWith('.json') && name !== journalName)
  if (!manifests.length) return 0
  if (isRunning()) throw new Error('Exit W1 before applying pending development builds')
  const started = performance.now()
  let validated = 0
  progress({ phase: 'validate', completed: 0, total: manifests.length })
  const batches = manifests.map(name => {
    const manifest = join(queue, name)
    const raw = readFileSync(manifest, 'utf8')
    const item = JSON.parse(raw)
    if (!validTarget(item.target)) throw new Error('Invalid pending build target')
    const stage = inside(artifactDirectory(root), relative(artifactDirectory(root), resolve(root, item.stage)))
    const destination = outputDirectory(root, item.target)
    const entries = item.entries.map(entry => {
      const source = checkedPath(root, inside(stage, entry.file))
      const target = checkedPath(root, inside(destination, entry.file))
      if (hash(source) !== entry.sha256) throw new Error('Pending build changed after completion: ' + item.target)
      return { source, file: entry.file, changed: !existsSync(target) || hash(target) !== entry.sha256 }
    })
    progress({ phase: 'validate', completed: ++validated, total: manifests.length })
    return { name, raw, manifest, target: item.target, stage, destination, entries, changed: entries.some(entry => entry.changed) }
  })
  const changedBatches = batches.filter(batch => batch.changed)
  for (const batch of changedBatches) {
    const paths = sequence(batch.destination)
    if (existsSync(paths.next) || existsSync(paths.previous)) throw new Error('Unowned pending build staging directory')
  }
  const journal = {
    version: 1,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    state: 'validated',
    batches: changedBatches.map(batch => ({
      target: batch.target,
      manifest: batch.name,
      stage: relative(root, batch.stage),
      destination: relative(root, batch.destination),
      state: 'validated',
      existed: existsSync(batch.destination),
    })),
  }
  writeJournal(root, journal)
  try {
    for (const [index, batch] of changedBatches.entries()) {
      const paths = sequence(batch.destination)
      mkdirSync(paths.next, { recursive: true })
      // Bundles are overlays: preserve omitted runtime files without copying their bytes.
      // Changed files never overwrite hardlinks; they are copied into previously empty paths.
      const replacements = new Set(batch.entries.filter(entry => entry.changed).map(entry => pathKey(resolve(paths.next, entry.file))))
      if (existsSync(paths.destination)) for (const source of files(paths.destination)) {
        const target = inside(paths.next, relative(paths.destination, source))
        if (replacements.has(pathKey(target))) continue
        mkdirSync(dirname(target), { recursive: true })
        try { linkSync(source, target) }
        catch (error) {
          if (!['EPERM', 'EXDEV', 'ENOTSUP'].includes(error?.code)) throw error
          copyFileSync(source, target)
        }
      }
      for (const { source, file, changed } of batch.entries) {
        if (!changed) continue
        const staged = inside(paths.next, file)
        mkdirSync(dirname(staged), { recursive: true })
        copyFileSync(source, staged)
      }
      if (existsSync(batch.destination)) renameSync(batch.destination, paths.previous)
      renameSync(paths.next, batch.destination)
      journal.batches[index].state = 'swapped'
      writeJournal(root, journal)
      progress({ phase: 'publish', completed: index + 1, total: changedBatches.length })
    }
    journal.state = 'committed'
    writeJournal(root, journal)
  } catch (error) {
    recoverOwnedBuilds(root, isRunning)
    throw error
  }
  for (const batch of batches) {
    if (batch.changed) discard(root, sequence(batch.destination).previous)
    if (readFileSync(batch.manifest, 'utf8') === batch.raw) unlinkSync(batch.manifest)
  }
  unlinkSync(journalPath(root))
  progress({ phase: 'complete', completed: manifests.length, total: manifests.length,
    changed: changedBatches.length, skipped: manifests.length - changedBatches.length, elapsedMs: Math.round(performance.now() - started) })
  return batches.length
}

function publicationLock(root, run) {
  const lock = checkedPath(root, join(stateDirectory(root), 'apply.lock'))
  mkdirSync(dirname(lock), { recursive: true })
  for (let attempt = 0; ; attempt++) {
    try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); break }
    catch (error) {
      if (error?.code !== 'EEXIST' || attempt !== 0) throw error
      const owner = Number(readFileSync(lock, 'utf8'))
      if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error('Invalid W1 publication lock; inspect before retrying')
      try { process.kill(owner, 0) }
      catch (probe) {
        if (probe?.code !== 'ESRCH') throw probe
        unlinkSync(lock)
        continue
      }
      throw new Error('W1 update already in progress; wait for the current launch')
    }
  }
  try { return run() } finally { unlinkSync(lock) }
}

/** Recover only a stopped runtime; concurrent launchers cannot undo an active publication. */
export function recoverPendingBuilds(root, isRunning = () => true) {
  if (!existsSync(journalPath(root))) return 0
  return publicationLock(root, () => recoverOwnedBuilds(root, isRunning))
}

/** Validate overlays, skip identical output, then publish with rollback while W1 is stopped. */
export function publishPendingBuilds(root, isRunning, progress = () => {}) {
  const queue = queueDirectory(root)
  if (!existsSync(queue) || !readdirSync(queue).some(name => name.endsWith('.json'))) return 0
  return publicationLock(root, () => publishOwnedBuilds(root, isRunning, progress))
}
