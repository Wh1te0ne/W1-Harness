/** Prepare a W1-branded copy of Electron once; daily launches only check its cache. */
import { prepareWindowsEntry } from './prepare-windows-entry.mjs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { closeSync, copyFileSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const requireDesktop = createRequire(join(root, 'apps/desktop/package.json'))
const electron = requireDesktop('electron')
const version = requireDesktop('electron/package.json').version
const product = JSON.parse(readFileSync(join(root, 'apps/desktop/w1-product.json'), 'utf8'))
const iconBytes = readFileSync(join(root, 'assets/w1/exports/app-icon.ico'))
const identity = JSON.stringify({ schema: 1, electron: version, name: product.name, appId: product.appId,
  icon: createHash('sha256').update(iconBytes).digest('hex') })
const install = resolve(process.argv[2])
const directory = join(install, 'shell', `${version}-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`)
const executable = join(directory, 'W1 Harness.exe')
const stamp = join(directory, 'w1-shell.json')

if (!existsSync(executable) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== identity) {
  if (process.argv.includes('--check')) throw new Error('W1 desktop runtime is not prepared. Run scripts/w1/Install-W1Launcher.ps1 once.')
  mkdirSync(install, { recursive: true })
  const lockPath = join(install, 'prepare-shell.lock')
  const lock = openSync(lockPath, 'wx')
  try {
    mkdirSync(directory, { recursive: true })
    cpSync(dirname(electron), directory, { recursive: true, filter: entry => entry !== electron })
    // Use the already installed resource editor owned by electron-builder; never modify its Electron input.
    const requireBuilder = createRequire(requireDesktop.resolve('app-builder-lib/package.json'))
    const { NtExecutable, NtExecutableResource, Data, Resource } = requireBuilder('resedit')
    const binary = NtExecutable.from(readFileSync(electron), { ignoreCert: true })
    const resources = NtExecutableResource.from(binary)
    const icons = Data.IconFile.from(iconBytes).icons.map(item => item.data)
    const groups = Resource.IconGroupEntry.fromEntries(resources.entries)
    if (!groups.length) throw new Error('Electron executable has no replaceable icon group')
    for (const group of groups) Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons)
    const versions = Resource.VersionInfo.fromEntries(resources.entries)
    if (!versions.length) throw new Error('Electron executable has no Windows version information')
    for (const info of versions) {
      for (const language of info.getAvailableLanguages()) info.setStringValues(language, {
        ProductName: product.name, FileDescription: product.name, InternalName: 'W1Harness', OriginalFilename: 'W1 Harness.exe',
      })
      info.outputToResourceEntries(resources.entries)
    }
    resources.outputResource(binary)
    writeFileSync(executable, Buffer.from(binary.generate()))
    copyFileSync(join(root, 'assets/w1/exports/app-icon.ico'), join(directory, 'w1-app.ico'))
    writeFileSync(stamp, identity)
  } finally {
    closeSync(lock)
    unlinkSync(lockPath)
  }
}
const requireBuilder = createRequire(requireDesktop.resolve('app-builder-lib/package.json'))
await prepareWindowsEntry(directory, join(dirname(electron), 'resources', 'default_app.asar'), () => requireBuilder('@electron/asar'))
console.log(executable)
