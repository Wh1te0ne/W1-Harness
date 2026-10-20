/** Queue completed package bundles; publish only before starting a stopped W1. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const queueDirectory = root => join(root, '.work/local-dev/pending-builds')
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
/** Publish a queue record only after a successful build; incomplete outputs remain unreachable. */
export function queuePackageBuild(root, target, output) {
  if (!validTarget(target)) throw new Error('Expected a package or desktop application target')
  const stage = inside(join(root, '.work/local-dev/pending-artifacts'), relative(join(root, '.work/local-dev/pending-artifacts'), output))
  const entries = files(stage).map(file => ({ file: relative(stage, file), sha256: hash(file) }))
  if (!entries.length) throw new Error('Pending build is empty')
  mkdirSync(queueDirectory(root), { recursive: true })
  const manifest = join(queueDirectory(root), target.replaceAll('/', '-') + '.json')
  const temporary = manifest + '.' + process.pid + '.tmp'
  writeFileSync(temporary, JSON.stringify({ target, stage: relative(root, stage), entries }) + '\n')
  renameSync(temporary, manifest)
}
/** Validate all queued bytes before writes; failed publication keeps its queue for retry and stops launch. */
export function publishPendingBuilds(root, isRunning) {
  if (!existsSync(queueDirectory(root))) return 0
  const manifests = readdirSync(queueDirectory(root)).filter(name => name.endsWith('.json'))
  if (!manifests.length) return 0
  if (isRunning()) throw new Error('Exit W1 before applying pending development builds')
  const batches = manifests.map(name => {
    const manifest = join(queueDirectory(root), name)
    const raw = readFileSync(manifest, 'utf8')
    const item = JSON.parse(raw)
    if (!validTarget(item.target)) throw new Error('Invalid pending build target')
    const stage = inside(join(root, '.work/local-dev/pending-artifacts'), relative(join(root, '.work/local-dev/pending-artifacts'), resolve(root, item.stage)))
    const destination = join(root, item.target, item.target === 'apps/web' ? 'dist' : 'lib')
    const entries = item.entries.map(entry => {
      const source = inside(stage, entry.file)
      const target = inside(destination, entry.file)
      if (hash(source) !== entry.sha256) throw new Error('Pending build changed after completion: ' + item.target)
      return { source, target }
    })
    return { manifest, raw, entries }
  })
  for (const batch of batches) for (const { source, target } of batch.entries) {
    mkdirSync(dirname(target), { recursive: true })
    const temporary = target + '.w1-update-' + process.pid
    copyFileSync(source, temporary)
    renameSync(temporary, target)
  }
  for (const batch of batches) if (readFileSync(batch.manifest, 'utf8') === batch.raw) unlinkSync(batch.manifest)
  return batches.length
}
