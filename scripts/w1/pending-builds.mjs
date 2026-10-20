/** Queue completed package bundles; swap whole output directories only before starting a stopped W1. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const journalName = 'apply-journal.json'
const previousSuffix = '.w1-prev'
const nextSuffix = '.w1-next'

const stateDirectory = root => join(root, '.work/local-dev')
const queueDirectory = root => join(stateDirectory(root), 'pending-builds')
const artifactDirectory = root => join(stateDirectory(root), 'pending-artifacts')
const journalPath = root => join(queueDirectory(root), journalName)
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
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
const discard = path => rmSync(path, { recursive: true, force: true })
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
export function recoverPendingBuilds(root) {
  const journal = journalPath(root)
  if (!existsSync(journal)) return 0
  let recorded
  try {
    recorded = JSON.parse(readFileSync(journal, 'utf8'))
  } catch {
    throw new Error('Pending build journal is unreadable: ' + journal)
  }
  const batches = Array.isArray(recorded.batches) ? recorded.batches : []
  const committed = recorded.state === 'committed'
  let rolledBack = 0
  for (const batch of [...batches].reverse()) {
    const paths = sequence(resolve(root, batch.destination))
    if (!committed && existsSync(paths.previous)) {
      discard(paths.destination)
      renameSync(paths.previous, paths.destination)
      if (batch.state === 'swapped') rolledBack += 1
    }
    discard(paths.previous)
    discard(paths.next)
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
export function publishPendingBuilds(root, isRunning) {
  recoverPendingBuilds(root)
  const queue = queueDirectory(root)
  if (!existsSync(queue)) return 0
  const manifests = readdirSync(queue).filter(name => name.endsWith('.json') && name !== journalName)
  if (!manifests.length) return 0
  if (isRunning()) throw new Error('Exit W1 before applying pending development builds')
  const batches = manifests.map(name => {
    const manifest = join(queue, name)
    const raw = readFileSync(manifest, 'utf8')
    const item = JSON.parse(raw)
    if (!validTarget(item.target)) throw new Error('Invalid pending build target')
    const stage = inside(artifactDirectory(root), relative(artifactDirectory(root), resolve(root, item.stage)))
    const destination = join(root, item.target, item.target === 'apps/web' ? 'dist' : 'lib')
    const entries = item.entries.map(entry => {
      const source = inside(stage, entry.file)
      inside(destination, entry.file)
      if (hash(source) !== entry.sha256) throw new Error('Pending build changed after completion: ' + item.target)
      return { source, file: entry.file }
    })
    return { name, raw, manifest, target: item.target, stage, destination, entries }
  })
  const journal = {
    version: 1,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    state: 'validated',
    batches: batches.map(batch => ({
      target: batch.target,
      manifest: batch.name,
      stage: relative(root, batch.stage),
      destination: relative(root, batch.destination),
      state: 'validated',
    })),
  }
  writeJournal(root, journal)
  try {
    for (const [index, batch] of batches.entries()) {
      const paths = sequence(batch.destination)
      discard(paths.next)
      for (const { source, file } of batch.entries) {
        const staged = inside(paths.next, file)
        mkdirSync(dirname(staged), { recursive: true })
        copyFileSync(source, staged)
      }
      discard(paths.previous)
      if (existsSync(batch.destination)) renameSync(batch.destination, paths.previous)
      renameSync(paths.next, batch.destination)
      journal.batches[index].state = 'swapped'
      writeJournal(root, journal)
    }
    journal.state = 'committed'
    writeJournal(root, journal)
  } catch (error) {
    recoverPendingBuilds(root)
    throw error
  }
  for (const batch of batches) {
    discard(sequence(batch.destination).previous)
    discard(batch.stage)
    if (readFileSync(batch.manifest, 'utf8') === batch.raw) unlinkSync(batch.manifest)
  }
  unlinkSync(journalPath(root))
  return batches.length
}
