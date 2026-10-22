/** Select an immutable local runtime only while its published workspace inputs still match. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const statePath = root => join(root, '.work/local-dev/runtime-archives/selected.json')
const json = file => JSON.parse(readFileSync(file, 'utf8'))
function inside(root, name) {
  const path = resolve(root, name)
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Startup runtime path escapes its workspace')
  return path
}
function stamp(path) {
  const info = statSync(path, { bigint: true })
  return [String(info.size), String(info.mtimeNs), String(info.ctimeNs), String(info.ino)]
}
const sameStamp = (left, right) => JSON.stringify(left) === JSON.stringify(right)
/** Directory names are watched as well as file contents, so newly added chunks invalidate old snapshots. */
export function startupDirectoryDigest(path) {
  return digest(JSON.stringify(readdirSync(path, { withFileTypes: true })
    .map(entry => [entry.name, entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'link' : 'file'])
    .sort((a, b) => a[0].localeCompare(b[0]))))
}
function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = path + '.' + process.pid + '.tmp'
  writeFileSync(temporary, JSON.stringify(value) + '\n')
  renameSync(temporary, path)
}
function checkedSelection(root) {
  const selection = json(statePath(root))
  if (selection.version !== 1 || !/^[a-f0-9-]{36}$/u.test(selection.id)) throw new Error('Invalid startup runtime selection')
  const directory = join(root, '.work/local-dev/runtime-archives', selection.id)
  const manifestFile = join(directory, 'manifest.json')
  const bytes = readFileSync(manifestFile)
  if (digest(bytes) !== selection.manifestSha256) throw new Error('Startup runtime manifest changed; prepare the archive again')
  const manifest = JSON.parse(bytes)
  if (manifest.version !== 1 || !Array.isArray(manifest.inputs) || !Array.isArray(manifest.directories)) throw new Error('Invalid startup runtime manifest')
  return { selection, directory, manifest }
}
/**
 * Check cached metadata on ordinary starts; rehash only changed inputs. Changed code uses the normal source runtime.
 * @param {string} root Selected worktree, after its pending updates have been applied.
 * @param {(event: object) => void} report Receives the selected archive or the reason for using source files.
 * @returns {string | undefined} Immutable dsh directory, or undefined when no current archive is available.
 */
export function selectStartupRuntime(root, report = () => {}) {
  if (!existsSync(statePath(root))) return undefined
  const { selection, directory, manifest } = checkedSelection(root)
  const cachePath = join(directory, 'validated.json')
  let cache = { manifestSha256: selection.manifestSha256, inputs: {}, directories: {}, archive: undefined }
  if (existsSync(cachePath)) {
    const previous = json(cachePath)
    if (previous.manifestSha256 === selection.manifestSha256) cache = previous
  }
  let dirty = false
  const mismatch = file => {
    if (dirty) atomicJson(cachePath, cache)
    report({ selected: false, reason: 'source-changed', file })
    return undefined
  }
  for (const entry of manifest.inputs) {
    const path = inside(root, entry.file)
    if (!existsSync(path)) return mismatch(entry.file)
    const current = stamp(path)
    if (sameStamp(current, cache.inputs[entry.file])) continue
    if (digest(readFileSync(path)) !== entry.sha256) return mismatch(entry.file)
    cache.inputs[entry.file] = current
    dirty = true
  }
  for (const entry of manifest.directories) {
    const path = inside(root, entry.file)
    if (!existsSync(path)) return mismatch(entry.file)
    const current = stamp(path)
    if (sameStamp(current, cache.directories[entry.file])) continue
    if (startupDirectoryDigest(path) !== entry.sha256) return mismatch(entry.file)
    cache.directories[entry.file] = current
    dirty = true
  }
  const archive = join(directory, 'app.asar')
  if (!existsSync(archive) || !existsSync(join(directory, 'app.asar.unpacked'))) throw new Error('Startup archive is incomplete; prepare it again')
  const archiveStamp = stamp(archive)
  if (!sameStamp(archiveStamp, cache.archive)) {
    if (digest(readFileSync(archive)) !== manifest.archiveSha256) throw new Error('Startup archive checksum differs; prepare it again')
    cache.archive = archiveStamp
    dirty = true
  }
  if (dirty) atomicJson(cachePath, cache)
  report({ selected: true, id: selection.id })
  return join(archive, 'dsh')
}
/** Select a fully copied archive; callers can prevalidate it without launching or changing application data. */
export function registerStartupRuntime(root, id) {
  if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('Invalid startup archive ID')
  const manifest = join(root, '.work/local-dev/runtime-archives', id, 'manifest.json')
  atomicJson(statePath(root), { version: 1, id, manifestSha256: digest(readFileSync(manifest)) })
}
