/** Build an immutable development runtime from current published files and a pinned hoisted dependency template. */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, globSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync, createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep, matchesGlob } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { officePackageDirectories } from '../libreoffice-packages.mjs'
import { desktopRuntimeFileExclusion } from '../../apps/desktop/scripts/runtime-file-policy.ts'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = file => JSON.parse(readFileSync(file, 'utf8'))
const slash = path => path.split(sep).join('/')
function contained(root, name) {
  const path = resolve(root, name)
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Runtime input escapes its root')
  return path
}
function catalog(root) {
  const directories = []
  for (const base of ['apps', 'vendor', 'packages', 'native/system/packages']) {
    for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = join(root, base, entry.name)
      if (base !== 'packages') directories.push(path)
      else for (const child of readdirSync(path, { withFileTypes: true })) if (child.isDirectory()) directories.push(join(path, child.name))
    }
  }
  directories.push(...['native/system', 'python/sdk-runtime', 'benchmarks', 'website'].map(path => join(root, path)))
  return new Map(directories.filter(path => existsSync(join(path, 'package.json'))).map(path => [json(join(path, 'package.json')).name, path]))
}

/**
 * Keep source inputs frozen in memory while ASAR serializes; external dependency bytes come from the immutable template.
 * @param {{root:string, template:string, templateRoot:string, output:string, overlay?:string}} options Preparation inputs.
 * @returns {Promise<object>} Sealed input and archive manifest; does not activate or launch an application.
 */
export async function prepareStartupRuntime({ root, template, templateRoot, output, overlay }) {
  root = resolve(root); template = resolve(template); templateRoot = resolve(templateRoot); output = resolve(output)
  if (existsSync(output)) throw new Error('Startup runtime output already exists')
  for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    if (hash(readFileSync(join(root, file))) !== hash(readFileSync(join(templateRoot, file)))) throw new Error('Dependency template is outdated; rebuild the offline hoisted template: ' + file)
  }
  const replacements = new Map()
  if (overlay) {
    const handoff = json(join(overlay, 'manifest.json'))
    if (resolve(handoff.dailyRoot) !== root) throw new Error('Overlay belongs to a different checkout')
    for (const entry of handoff.sources) replacements.set(slash(entry.file), entry.sha256 === null ? null : { path: contained(join(overlay, 'sources'), entry.file), sha256: entry.sha256 })
    for (const bundle of handoff.bundles) for (const entry of bundle.entries) replacements.set(`${bundle.target}/${bundle.target === 'apps/web' ? 'dist' : 'lib'}/${slash(entry.file)}`, { path: contained(join(overlay, 'bundles', bundle.target), entry.file), sha256: entry.sha256 })
  }
  const inputs = new Map(), directoryInputs = new Map(), workspace = catalog(root)
  function sourceBytes(file) {
    const replacement = replacements.get(file)
    if (replacement === null) throw new Error('Requested a deleted runtime input: ' + file)
    const bytes = readFileSync(replacement?.path ?? contained(root, file))
    const sha256 = hash(bytes)
    if (replacement && replacement.sha256 !== sha256) throw new Error('Frozen overlay changed: ' + file)
    inputs.set(file, { file, sha256, size: bytes.length })
    return bytes
  }
  function watchDirectory(file) {
    if (directoryInputs.has(file)) return
    const path = contained(root, file)
    const entries = new Map(existsSync(path) ? readdirSync(path, { withFileTypes: true }).map(entry => [entry.name, entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'link' : 'file']) : [])
    for (const [name, replacement] of replacements) {
      if (!name.startsWith(file + '/')) continue
      const rest = name.slice(file.length + 1), first = rest.split('/')[0]
      if (rest.includes('/')) { if (replacement) entries.set(first, 'directory') }
      else if (replacement) entries.set(first, 'file')
      else entries.delete(first)
    }
    directoryInputs.set(file, { file, sha256: hash(JSON.stringify([...entries].sort((a, b) => a[0].localeCompare(b[0])))) })
  }
  const streams = [], sources = [], archiveDirectories = new Set(), emitted = new Set(), packages = [], packageCopies = []
  function directory(path) {
    if (path === '.' || archiveDirectories.has(path)) return
    directory(dirname(path)); archiveDirectories.add(path); streams.push({ path, type: 'directory', unpacked: false })
  }
  function file(path, physical, bytes, unpacked = false) {
    if (emitted.has(path)) throw new Error('Duplicate archived file: ' + path)
    emitted.add(path); directory(dirname(path))
    const info = physical ? statSync(physical) : { mode: 0o644, size: bytes.length }
    const index = sources.length; sources.push({ path: physical, size: bytes?.length ?? info.size, bytes })
    streams.push({ path, type: 'file', stat: { ...info, size: bytes?.length ?? info.size }, unpacked, streamGenerator: () => streamFor(index) })
  }
  const office = await officePackageDirectories(template, { platform: 'win32', arch: 'x64' })
  const excluded = path => desktopRuntimeFileExclusion(relative(join('dsh', 'node_modules'), path), { platform: 'win32', arch: 'x64' }, 'win32-x64') !== undefined
  function copyWorkspace(physical, logical, packageRoot) {
    const packageRelative = slash(relative(root, packageRoot))
    const manifest = JSON.parse(sourceBytes(packageRelative + '/package.json'))
    const previousPath = join(templateRoot, relative(root, packageRoot), 'package.json')
    if (existsSync(previousPath)) {
      const previous = json(previousPath)
      for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) if (JSON.stringify(manifest[field] ?? {}) !== JSON.stringify(previous[field] ?? {})) throw new Error('Runtime dependencies changed; rebuild the template for ' + manifest.name)
    }
    let patterns = manifest.files
    if (!patterns) {
      // Private assemblies without a publish list retain their deployed paths and current lib output.
      patterns = [...globSync('**/*', { cwd: physical, exclude: ['**/node_modules/**'] }), 'lib/**/*']
    }
    patterns = [...patterns, 'package.json', 'README*', 'LICENSE*'].flatMap(pattern => existsSync(join(packageRoot, pattern)) && statSync(join(packageRoot, pattern)).isDirectory() ? [slash(pattern) + '/**/*'] : [slash(pattern)])
    const files = new Set(globSync(patterns, { cwd: packageRoot, exclude: ['**/node_modules/**', '**/.env*', '**/.work/**', '**/.git/**'] }).map(slash))
    for (const [name, replacement] of replacements) if (name.startsWith(packageRelative + '/')) {
      const suffix = name.slice(packageRelative.length + 1)
      if (patterns.some(pattern => matchesGlob(suffix, pattern))) { if (replacement) files.add(suffix); else files.delete(suffix) }
    }
    for (const name of [...files].sort()) {
      const destination = join(logical, name), source = join(packageRoot, name)
      if (excluded(destination) || (existsSync(source) && statSync(source).isDirectory())) continue
      const sourceName = packageRelative + '/' + name
      const bytes = sourceBytes(sourceName)
      file(destination, undefined, bytes, /\.(node|dll|exe|so|dylib)$/u.test(name))
      let parent = slash(dirname(sourceName))
      while (parent.startsWith(packageRelative)) { watchDirectory(parent); if (parent === packageRelative) break; parent = slash(dirname(parent)) }
    }
    packageCopies.push({ name: manifest.name, version: manifest.version, source: packageRelative, archive: slash(logical) })
    // Linked workspace sources contain their development dependency graph; the deployed root already provides those packages.
    if (!lstatSync(physical).isSymbolicLink() && existsSync(join(physical, 'node_modules'))) scan(join(physical, 'node_modules'), join(logical, 'node_modules'))
  }
  function scan(physical, logical) {
    for (const entry of readdirSync(physical, { withFileTypes: true })) {
      const source = join(physical, entry.name), destination = join(logical, entry.name)
      if (excluded(destination)) continue
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const manifestPath = join(source, 'package.json')
        const name = existsSync(manifestPath) ? json(manifestPath).name : undefined
        if (workspace.has(name)) { copyWorkspace(source, destination, workspace.get(name)); continue }
        if (entry.isSymbolicLink()) throw new Error('Unexpected external dependency link: ' + source)
        directory(destination); scan(source, destination)
      } else file(destination, source, undefined, office.some(dir => source.startsWith(dir + sep)) || /\.(node|dll|exe|so|dylib)$/u.test(destination) || /spawn-helper$/u.test(destination))
    }
  }
  scan(join(template, 'node_modules'), join('dsh', 'node_modules'))
  for (const entry of readdirSync(join(template, 'node_modules'), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const names = entry.name.startsWith('@') ? readdirSync(join(template, 'node_modules', entry.name)).map(name => entry.name + '/' + name) : [entry.name]
    for (const name of names) {
      const path = join(template, 'node_modules', name, 'package.json')
      if (!existsSync(path)) continue
      const manifest = workspace.has(name) ? JSON.parse(sourceBytes(slash(relative(root, workspace.get(name))) + '/package.json')) : json(path)
      packages.push({ name: manifest.name, version: manifest.version, path: 'node_modules/' + name })
    }
  }
  const metadata = json(join(root, 'apps/desktop/.desktop-build/development/project/desktop-runtime.json'))
  metadata.sharedPackages = packages.sort((a, b) => a.name.localeCompare(b.name))
  metadata.files = []
  file(join('dsh', 'desktop-runtime.json'), undefined, Buffer.from(JSON.stringify(metadata)))
  file(join('dsh', 'package.json'), undefined, Buffer.from(JSON.stringify({ name: '@deepseek-ai/dsh-desktop-runtime', version: metadata.release.version, type: 'module', private: true, dependencies: Object.fromEntries(packages.map(row => [row.name, row.version])) })))
  for (const name of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json', 'apps/desktop/package.json', 'node_modules/.modules.yaml']) if (existsSync(join(root, name))) sourceBytes(name)
  for (const name of globSync('patches/**/*', { cwd: root })) if (statSync(join(root, name)).isFile()) sourceBytes(slash(name))
  // At most eight reads and 64 small buffers are ahead of the ASAR writer.
  let active = 0, nextIndex = 0, lastIndex = -1
  const pending = new Map(), queue = []
  function pump() {
    while (active < 8 && queue.length) {
      const job = queue.shift(); active++
      readFile(job.path).then(job.resolve, error => job.resolve({ error })).finally(() => { active--; pump() })
    }
  }
  function streamFor(index) {
    if (index < lastIndex) { if (active || queue.length) throw new Error('Archive pass still has pending input'); nextIndex = 0; pending.clear() }
    lastIndex = index
    for (; nextIndex < Math.min(sources.length, index + 64); nextIndex++) {
      const source = sources[nextIndex]
      if (source.bytes) { pending.set(nextIndex, Promise.resolve(source.bytes)); continue }
      if (source.size > 8 * 1024 * 1024) continue
      pending.set(nextIndex, new Promise(resolve => queue.push({ path: source.path, resolve })))
    }
    pump()
    const promise = pending.get(index); pending.delete(index)
    return promise ? Readable.from((async function* () { const bytes = await promise; if (bytes.error) throw bytes.error; yield bytes })()) : createReadStream(sources[index].path)
  }
  const require = createRequire(join(root, 'apps/desktop/package.json'))
  const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
  const asar = builderRequire('@electron/asar')
  mkdirSync(output, { recursive: true })
  console.info(JSON.stringify({ phase: 'archive', files: sources.length, workspaceInputs: inputs.size }))
  await finished(await asar.createPackageFromStreams(join(output, 'app.asar'), streams))
  const manifest = { version: 1, createdAt: new Date().toISOString(), release: metadata.release,
    archiveSha256: hash(readFileSync(join(output, 'app.asar'))), inputs: [...inputs.values()], directories: [...directoryInputs.values()], packageCopies }
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest) + '\n')
  return manifest
}

if (import.meta.main) {
  const { values } = parseArgs({ options: Object.fromEntries(['root', 'template', 'template-root', 'output', 'overlay'].map(name => [name, { type: 'string' }])) })
  if (!values.root || !values.template || !values['template-root'] || !values.output) throw new Error('Pass --root, --template, --template-root and a new --output')
  const result = await prepareStartupRuntime({ root: values.root, template: values.template, templateRoot: values['template-root'], output: values.output, overlay: values.overlay })
  console.info(JSON.stringify({ prepared: values.output, inputs: result.inputs.length, archiveSha256: result.archiveSha256 }))
}
