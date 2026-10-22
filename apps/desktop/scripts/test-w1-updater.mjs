/** Qualify real Electron update downloads in a private profile; never create a window or run an installer. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const repository = fileURLToPath(new URL('../../..', import.meta.url))
if (process.versions.electron === undefined) {
  const base = join(repository, '.work/w1-updater')
  await mkdir(base, { recursive: true })
  const directory = await mkdtemp(join(base, 'run-'))
  const executable = join(repository, 'apps/desktop/.desktop-build/targets/win-x64/electron/electron.exe')
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/KEY|SECRET|TOKEN|PASSWORD|^ELECTRON_RUN_AS_NODE$|^NODE_OPTIONS$/iu.test(name)))
  const child = spawn(executable, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...environment, W1_UPDATER_TEST_ROOT: directory }, stdio: 'inherit', windowsHide: true,
  })
  const timer = setTimeout(() => { child.kill() }, process.argv.includes('--github') ? 1800000 : 300000)
  const code = await new Promise((done, fail) => {
    child.once('error', fail)
    child.once('exit', value => { done(value) })
  }).finally(() => { clearTimeout(timer) })
  if (code !== 0) throw new Error(`W1 updater qualification failed: ${code}`)
  console.log(`W1 updater evidence: ${directory}`)
} else {
  const { app, BrowserWindow } = await import('electron')
  const failed = (error) => { console.error(error); app.exit(1) }
  process.on('uncaughtException', failed)
  process.on('unhandledRejection', failed)
  const { default: library } = await import('electron-updater')
  const { DesktopUpdateCoordinator } = await import('../lib/types/update-coordinator.js')
  const { DesktopUpdateHttpExecutor } = await import('../lib/types/update-http-executor.js')
  const { createUpdateServer } = await import('../tests/fixtures/update-server.mjs')
  const run = async () => {
  const directory = process.env.W1_UPDATER_TEST_ROOT
  assert.ok(directory)
  app.setPath('userData', join(directory, 'electron'))
  app.disableHardwareAcceleration()
  await app.whenReady()
  const server = process.argv.includes('--github') ? undefined : await createUpdateServer()
  const cases = []
  try {
    for (const mode of server ? ['healthy', 'corrupt'] : ['github']) {
      const cache = join(directory, mode)
      await mkdir(cache, { recursive: true })
      const configuration = join(cache, 'app-update.yml')
      await writeFile(configuration, 'updaterCacheDirName: w1-qualification\n')
      const forbidden = () => { throw new Error('Installer execution is forbidden during qualification') }
      const currentVersion = mode === 'github' ? '0.1.0-alpha.4' : '1.0.0'
      const updater = new library.NsisUpdater(undefined, { version: currentVersion, name: 'W1H qualification',
        isPackaged: true, appUpdateConfigPath: configuration, userDataPath: cache, baseCachePath: cache,
        whenReady: async () => {}, quit: forbidden, relaunch: forbidden, onQuit: forbidden })
      updater.logger = null
      updater.httpExecutor = new DesktopUpdateHttpExecutor(60000)
      updater.disableDifferentialDownload = true
      updater.disableWebInstaller = true
      if (server) { server.select(mode); updater.setFeedURL({ provider: 'generic', url: server.url, channel: 'nightly' }) }
      else updater.setFeedURL({ provider: 'github', owner: 'Wh1te0ne', repo: 'W1-Harness', channel: 'alpha' })
      updater.quitAndInstall = forbidden
      const states = []
      const coordinator = new DesktopUpdateCoordinator(state => { states.push(state.phase); return state },
        async () => false, updater, () => true, () => currentVersion, undefined, server ? 'nightly' : 'alpha')
      try {
        const available = await coordinator.check(true)
        assert.equal(available.phase, 'available', JSON.stringify(available))
        const downloaded = await coordinator.download(available.version)
        assert.equal(downloaded.phase, mode === 'corrupt' ? 'error' : 'ready', JSON.stringify(downloaded))
        cases.push({ mode, version: available.version, downloaded: downloaded.phase, states, installerExecuted: false })
      } finally { coordinator.dispose() }
    }
    const windowsCreated = BrowserWindow.getAllWindows().length
    assert.equal(windowsCreated, 0)
    await writeFile(join(directory, 'result.json'), JSON.stringify({ cases, windowsCreated }, null, 2) + '\n')
  } finally { await server?.close(); app.quit() }
  }
  void run().catch(failed)
}
