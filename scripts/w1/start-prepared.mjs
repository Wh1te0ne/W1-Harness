/** Fast daily launch; refresh links through the original development script only when needed. */
import { spawn, execFileSync } from 'node:child_process'
// Runs before the application imports build output, so an interrupted publication is undone first.
import './recover-before-launch.mjs'
import { publishPendingBuilds } from './pending-builds.mjs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { developmentRuntimeDirectory } from '../../apps/desktop/scripts/desktop-build-paths.mjs'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../../apps/desktop/lib/types/host-protocol.js'
import { preparedProjectMatches } from './prepared-project.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const app = join(root, 'apps/desktop')
const require = createRequire(join(app, 'package.json'))
const { values } = parseArgs({ options: { 'prepare-only': { type: 'boolean' }, 'refresh-project': { type: 'boolean' } } })
const runtime = developmentRuntimeDirectory()
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`W1 launch exited with ${code}`)))
  })
}
if (!values['prepare-only']) {
  if (!process.env.W1_DESKTOP_EXECUTABLE || !process.env.DSH_DESKTOP_USER_DATA_DIR) throw new Error('Launch W1 through Start-W1.ps1')
  const count = publishPendingBuilds(root, () => {
    const output = execFileSync('C:/Program Files/PowerShell/7/pwsh.exe', ['-NoProfile', '-Command',
      "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name='W1 Harness.exe'\" | Where-Object { $_.ExecutablePath -eq $env:W1_DESKTOP_EXECUTABLE -and $_.CommandLine -notlike '*--type=*' }).Count"],
    { encoding: 'utf8', windowsHide: true })
    return Number(output.trim()) > 0
  })
  if (count) console.info('[w1-startup] applied pending package builds:', count)
}
const current = preparedProjectMatches({ root, electron: require('electron'), runtime,
  cacheDirectory: join(root, '.work/local-dev/launch-cache'), hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION })
if (values['refresh-project'] || !current) {
  await run(process.execPath, ['--import', 'tsx/esm', 'apps/desktop/scripts/dev.ts', '--skip-build', '--reuse-runtime', '--prepare-only'])
}
if (!values['prepare-only']) {
  const executable = process.env.W1_DESKTOP_EXECUTABLE
  const userData = process.env.DSH_DESKTOP_USER_DATA_DIR
  if (!executable || !userData) throw new Error('Use scripts/w1/Start-W1.ps1 to select the W1 application and data directories')
  console.info('[w1-startup]', JSON.stringify({ stage: 'prepared', elapsedMs: Date.now() - Number(process.env.W1_LAUNCH_STARTED_AT) }))
  const inspect = process.env.DSH_DESKTOP_NO_INSPECT !== '1'
  const args = [...inspect ? [
    `--inspect=127.0.0.1:${process.env.DSH_DESKTOP_MAIN_INSPECT_PORT ?? '9229'}`,
    `--remote-debugging-port=${process.env.DSH_DESKTOP_RENDERER_DEBUG_PORT ?? '9222'}`,
  ] : [], `--user-data-dir=${userData}`, app]
  await run(executable, args, { ...process.env, DSH_DESKTOP_PRIMARY_RUNTIME_DIR: runtime,
    DSH_DESKTOP_HOST_INSPECT_PORT: inspect ? process.env.DSH_DESKTOP_HOST_INSPECT_PORT ?? '9230' : undefined,
    ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? '1' })
}
