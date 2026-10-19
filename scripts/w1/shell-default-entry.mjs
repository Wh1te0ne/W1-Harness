/** An argument-free W1 runtime launch always enters through the installed launcher. */
import { app, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

if (process.argv.length > 1) {
  // Preserve Electron's original argument parser for app paths and utility flags.
  await import(pathToFileURL(join(process.resourcesPath, 'w1-electron-default.asar', 'main.js')).href)
} else {
  const launcher = resolve(process.resourcesPath, '../../..', 'W1 Harness.exe')
  const fail = async (message) => {
    await app.whenReady()
    dialog.showErrorBox('W1 Harness 启动失败', message)
    app.exit(1)
  }
  if (!existsSync(launcher) || launcher.toLowerCase() === resolve(process.execPath).toLowerCase()) {
    await fail('找不到 W1 的日用启动器，请修复桌面入口。\n' + launcher)
  } else {
    const child = spawn(launcher, [], { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', error => { void fail(error.message) })
    child.once('spawn', () => { child.unref(); app.exit(0) })
  }
}
