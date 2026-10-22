/** Fast daily launch; refresh links through the original development script only when needed. */
import { spawn } from 'node:child_process'
// Runs before the application imports build output, so an interrupted publication is undone first.
import './recover-before-launch.mjs'
import { publishPendingBuilds } from './pending-builds.mjs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { developmentRuntimeDirectory } from '../../apps/desktop/scripts/desktop-build-paths.mjs'
import { preparedProjectMatches } from './prepared-project.mjs'
import { isW1Running } from './w1-running.mjs'
import { startupReporter } from './startup-report.mjs'
import { selectStartupRuntime } from './startup-runtime.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const app = join(root, 'apps/desktop')
const require = createRequire(join(app, 'package.json'))
const { values } = parseArgs({ options: { 'prepare-only': { type: 'boolean' }, 'refresh-project': { type: 'boolean' } } })
const runtime = developmentRuntimeDirectory()
const report = startupReporter()
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`W1 launch exited with ${code}`)))
  })
}
if (!values['prepare-only']) {
  if (!process.env.W1_DESKTOP_EXECUTABLE || !process.env.DSH_DESKTOP_USER_DATA_DIR) throw new Error('Launch W1 through Start-W1.ps1')
  report('publish-start')
  const count = publishPendingBuilds(root, isW1Running, progress => report('publish-progress', progress))
  if (count) console.info('[w1-startup] applied pending package builds:', count)
  report('publish-ready')
}
// Load runtime declarations only after recovery/publication, never from a half-swapped lib.
const { DESKTOP_HOST_PROTOCOL_VERSION } = await import(pathToFileURL(join(app, 'lib/types/host-protocol.js')).href)
report('project-check')
const current = preparedProjectMatches({ root, electron: require('electron'), runtime,
  cacheDirectory: join(root, '.work/local-dev/launch-cache'), hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION })
if (values['refresh-project'] || !current) {
  report('project-refresh')
  await run(process.execPath, ['--import', 'tsx/esm', 'apps/desktop/scripts/dev.ts', '--skip-build', '--reuse-runtime', '--prepare-only'])
}
report('project-ready')
const archivedRuntime = selectStartupRuntime(root, detail => report('runtime-archive', detail))
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
    DSH_DESKTOP_DSH_DIR: archivedRuntime,
    DSH_DESKTOP_HOST_INSPECT_PORT: inspect ? process.env.DSH_DESKTOP_HOST_INSPECT_PORT ?? '9230' : undefined,
    ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? '1' })
}
