/** Resolve W1-owned paths before Electron takes its single-instance lock or starts a Host. */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { App, BrowserWindow } from 'electron'
import type { W1Product } from './w1-upstream.ts'

/**
 * Relaunch through the development publisher so queued updates are applied after exit.
 * @param application - Current Electron application; packaged builds use their ordinary restart.
 */
export function relaunchW1(application: Pick<App, 'isPackaged' | 'relaunch'>): void {
  if (process.platform === 'win32' && process.env.W1_TEST_MODE === '1') {
    const entry = process.env.W1_TEST_LAUNCHER, powershell = process.env.W1_TEST_POWERSHELL
    if (entry && powershell && isAbsolute(entry) && isAbsolute(powershell) && existsSync(entry) && existsSync(powershell)) {
      application.relaunch({ execPath: powershell, args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', entry,
        ...isW1Development(application) ? [] : ['-Executable', process.execPath]] })
      return
    }
  }
  const launcher = w1DevelopmentLauncher(application)
  if (launcher !== undefined) {
    application.relaunch({ execPath: launcher, args: [] })
  } else application.relaunch()
}

/**
 * Keep the explicitly selected W1 executable on source development paths even when Electron classifies its renamed binary as packaged.
 * @param application - Electron's default packaging classification.
 * @returns whether the current executable is a development launch.
 */
export function isW1Development(application: Pick<App, 'isPackaged'>): boolean {
  const executable = process.env.W1_DESKTOP_EXECUTABLE
  return !application.isPackaged || (process.platform === 'win32' && executable !== undefined
    && isAbsolute(executable) && executable.toLowerCase() === process.execPath.toLowerCase())
}

/**
 * Resolve the permanent launcher shared by the local Windows shortcuts and window relaunch metadata.
 * @param application - Current Electron application.
 * @returns The installed local launcher, if this launch uses it.
 */
export function w1DevelopmentLauncher(application: Pick<App, 'isPackaged'>): string | undefined {
  if (process.platform !== 'win32' || process.env.W1_TEST_MODE === '1' || !isW1Development(application)) return undefined
  const launcher = process.env.W1_DESKTOP_LAUNCHER
  if (launcher !== undefined && isAbsolute(launcher) && existsSync(launcher)) return launcher
}

/**
 * Isolate the fork from inherited DSH_HOME and Electron's scoped upstream package name.
 * @param application - Electron application before ready.
 * @returns W1 build identity; development-only overrides stay explicit to W1.
 */
export function configureW1Identity(application: Pick<App,
  'getAppPath' | 'getPath' | 'setName' | 'setPath' | 'setAppUserModelId' | 'isPackaged'>): W1Product {
  const build = JSON.parse(readFileSync(join(application.getAppPath(), 'w1-product.json'), 'utf8')) as W1Product
  const testing = process.env.W1_TEST_MODE === '1'
  const product = testing ? { ...build, name: `${build.name} Test`, appId: `${build.appId}.test` } : build
  const home = testing ? join(application.getPath('home'), '.w1-harness-test')
    : isW1Development(application) && process.env.W1_HOME !== undefined ? process.env.W1_HOME
      : join(application.getPath('home'), '.w1-harness')
  const userData = testing ? join(application.getPath('appData'), product.name)
    : isW1Development(application) && process.env.W1_USER_DATA !== undefined ? process.env.W1_USER_DATA
      : join(application.getPath('appData'), product.name)
  if (!isAbsolute(home) || !isAbsolute(userData)) throw new Error('W1 data paths must be absolute')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  application.setName(product.name)
  application.setPath('userData', userData)
  application.setPath('sessionData', userData)
  if (process.platform === 'win32') application.setAppUserModelId(isW1Development(application) ? `${product.appId}.dev` : product.appId)
  process.env.DSH_HOME = home
  process.env.DSH_AGENTS_HOME = join(home, 'agents')
  mkdirSync(process.env.DSH_AGENTS_HOME, { recursive: true })
  process.env.W1_DOCUMENTS_DIR = join(home, 'projects')
  // Native compression plugins use XDG state and their own sidecar ports outside DSH_HOME.
  for (const [key, directory] of Object.entries({ XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data', XDG_STATE_HOME: 'state', XDG_CACHE_HOME: 'cache' })) {
    process.env[key] = join(home, 'xdg', directory)
  }
  process.env.BILI_CONFIG_FILE = join(home, 'xdg', 'config', 'billion-context', 'billion-context.json')
  process.env.BILI_SESSIONS_DIR = join(home, 'xdg', 'data', 'billion-context', 'sessions')
  process.env.BILI_ZONE_PORT = testing ? '28788' : '28787'
  process.env.BILI_NATIVE_ATTACH_EXTERNAL = '0'
  delete process.env.BILLION_CONTEXT_ATTACH
  delete process.env.BILLION_CONTEXT_PROXY
  return product
}

/**
 * Set the window icon and the Windows relaunch metadata from the same retained ICO.
 * @param application - current Electron application.
 * @param window - Windows desktop window.
 * @param product - W1 identity shared with the installed shortcuts.
 * @param icon - Retained system-theme ICO shared with the shortcuts.
 */
export function configureW1Taskbar(
  application: Pick<App, 'isPackaged'>,
  window: Pick<BrowserWindow, 'setIcon' | 'setAppDetails'>,
  product: Pick<W1Product, 'appId' | 'name'>,
  icon: string,
): void {
  window.setIcon(icon)
  const details = { appIconPath: icon, appIconIndex: 0 }
  if (process.env.W1_TEST_MODE === '1') {
    const launcher = process.env.W1_TEST_LAUNCHER
    const powershell = process.env.W1_TEST_POWERSHELL
    if (launcher && powershell && isAbsolute(launcher) && isAbsolute(powershell)
      && existsSync(launcher) && existsSync(powershell)) {
      const development = isW1Development(application)
      window.setAppDetails({
        ...details,
        appId: development ? `${product.appId}.dev` : product.appId,
        relaunchCommand: '"' + powershell + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'
          + launcher + '"' + (development ? '' : ' -Executable "' + process.execPath + '"'),
        relaunchDisplayName: product.name,
      })
      return
    }
  }
  const launcher = w1DevelopmentLauncher(application)
  window.setAppDetails(launcher === undefined ? details : {
    ...details,
    appId: `${product.appId}.dev`,
    relaunchCommand: '"' + launcher + '"',
    relaunchDisplayName: product.name,
  })
}
