/** Assemble W1 with its own private package closure; upstream npm publication rules do not govern W1 versions. */
import { spawn } from 'node:child_process'
import { existsSync, globSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { desktopBuildCommitEnvironment, readDesktopBuildCommit } from '../../apps/desktop/scripts/desktop-build-commit.mjs'
const root = fileURLToPath(new URL('../..', import.meta.url))
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('W1 releases currently require Windows x64')
const paths = join(root, 'apps/desktop/.desktop-build/targets/win-x64')
const packed = join(paths, 'packed/w1')
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/^(?:DOWNLOAD_(?:PROD|TEST)_|DSH_DESKTOP_WINDOWS_|DSH_CRED_|CSC_|WIN_CSC_|GH_TOKEN$|GITHUB_TOKEN$)/u.test(name)
  && !/(?:API_KEY|API_TOKEN)$/u.test(name)))
Object.assign(environment, { DSH_DESKTOP_UNSIGNED: '1', DSH_DESKTOP_TARGET_PLATFORM: 'win32',
  DSH_DESKTOP_TARGET_ARCH: 'x64', CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_7Z_FILTER: 'BCJ',
  DSH_GATE_CONCURRENCY: process.env.DSH_GATE_CONCURRENCY ?? '2' })
Object.assign(environment, desktopBuildCommitEnvironment(readDesktopBuildCommit(root)))
function run(args, cwd = root) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(root, 'node_modules/pnpm/bin/pnpm.cjs'), ...args],
      { cwd, env: environment, stdio: 'inherit', windowsHide: true })
    child.once('error', fail)
    child.once('exit', code => code === 0 ? done() : fail(new Error(`W1 packaging step failed (${code}): ${args.slice(0, 3).join(' ')}`)))
  })
}
await run(['run', 'build'])
await run(['--dir', 'native/system', 'run', 'build:ts'])
const members = new Map()
for (const file of globSync(['vendor/*/package.json', 'packages/*/*/package.json', 'native/system/package.json',
  'native/system/packages/*/package.json', 'apps/*/package.json'], { cwd: root })) {
  const manifest = JSON.parse(readFileSync(join(root, file), 'utf8'))
  members.set(manifest.name, { manifest, directory: file.slice(0, -'/package.json'.length).replaceAll('\\', '/') })
}
const selected = new Set()
function visit(name) {
  if (selected.has(name) || !members.has(name)) return
  const { manifest } = members.get(name)
  if (manifest.os && !manifest.os.includes('win32') || manifest.cpu && !manifest.cpu.includes('x64')) return
  selected.add(name)
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(manifest[section] ?? {})) visit(dependency)
  }
}
visit('@deepseek-ai/dsh')
visit('@deepseek-ai/dsh-desktop-host')
mkdirSync(packed, { recursive: true })
await run(['pack', '--recursive', '--workspace-concurrency=4', ...[...selected].map(name => `--filter=${name}`),
  '--pack-destination', packed])
const desktop = join(root, 'apps/desktop')
if (!process.argv.includes('--reuse-runtime')) await run(['run', 'prepare:runtime'], desktop)
else if (!existsSync(join(paths, 'runtime/versions.json')) || !existsSync(join(paths, 'electron/electron.exe'))) {
  throw new Error('No reusable target runtime exists; omit --reuse-runtime')
}
await run(['run', 'prepare:packages', '--from', packed], desktop)
await run(['run', 'prepare:dsh'], desktop)
await run(['exec', 'electron-builder', '--config', 'electron-builder.config.mjs', '--win', '--x64', '--publish', 'never'], desktop)
await run(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts', '--unsigned'], desktop)
console.info('W1 Windows package and built runtime verified. Collect assets with scripts/w1/collect-release.mjs.')
