/** Resolve W1-owned paths before Electron takes its single-instance lock or starts a Host. */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { App, BrowserWindow, Shell } from 'electron'
import type { W1Product } from './w1-upstream.ts'

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
 * Isolate the fork from inherited DSH_HOME and Electron's scoped upstream package name.
 * @param application - Electron application before ready.
 * @returns W1 build identity; development-only overrides stay explicit to W1.
 */
export function configureW1Identity(application: App): W1Product {
  const product = JSON.parse(readFileSync(join(application.getAppPath(), 'w1-product.json'), 'utf8')) as W1Product
  const home = isW1Development(application) && process.env.W1_HOME !== undefined ? process.env.W1_HOME : join(application.getPath('home'), '.w1-harness')
  const userData = isW1Development(application) && process.env.W1_USER_DATA !== undefined ? process.env.W1_USER_DATA : join(application.getPath('appData'), product.name)
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
  process.env.BILI_ZONE_PORT = '28787'
  process.env.BILI_NATIVE_ATTACH_EXTERNAL = '0'
  delete process.env.BILLION_CONTEXT_ATTACH
  delete process.env.BILLION_CONTEXT_PROXY
  return product
}

/**
 * Route development taskbar pins through the installed W1 launcher.
 * Packaged apps and development without the launcher keep their existing relaunch behavior.
 * @param application - current Electron application.
 * @param window - newly created desktop window, before it becomes visible.
 * @param product - W1 identity shared with the installed shortcuts.
 */
export function configureW1Taskbar(
  application: Pick<App, 'isPackaged' | 'getAppPath'>,
  window: Pick<BrowserWindow, 'setIcon' | 'setAppDetails'>,
  product: W1Product,
): void {
  if (process.platform !== 'win32' || !isW1Development(application)) return
  const icon = join(application.getAppPath(), 'resources', 'icon-windows.png')
  window.setIcon(icon)
  const launcher = process.env.W1_DESKTOP_LAUNCHER
  if (launcher === undefined || !isAbsolute(launcher) || !existsSync(launcher)) return
  const taskbarIcon = join(dirname(launcher), 'w1-app.ico')
  window.setAppDetails({
    appId: `${product.appId}.dev`,
    appIconPath: existsSync(taskbarIcon) ? taskbarIcon : launcher,
    appIconIndex: 0,
    relaunchCommand: '"' + launcher + '"',
    relaunchDisplayName: product.name,
  })
}

/**
 * Register the local development entry in the running user's actual Start Menu.
 * This also repairs shortcuts written into a packaged development tool's private AppData.
 * @param application - ready Electron application; packaged releases keep their installer-owned shortcut.
 * @param desktopShell - Windows shortcut operations.
 * @param product - identity shared with the desktop shortcut and taskbar.
 */
export function configureW1StartMenu(
  application: Pick<App, 'isPackaged' | 'getPath'>,
  desktopShell: Pick<Shell, 'readShortcutLink' | 'writeShortcutLink'>,
  product: W1Product,
): void {
  if (process.platform !== 'win32' || !isW1Development(application)) return
  const launcher = process.env.W1_DESKTOP_LAUNCHER
  if (launcher === undefined || !isAbsolute(launcher) || !existsSync(launcher)) return
  const appId = `${product.appId}.dev`
  const directory = dirname(launcher)
  const icon = join(directory, 'w1-app.ico')
  const programs = join(application.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  const shortcut = join(programs, 'W1 Harness.lnk')
  if (existsSync(shortcut)) {
    const current = desktopShell.readShortcutLink(shortcut)
    if (current.target === launcher && current.icon === icon && current.appUserModelId === appId) return
    if (current.appUserModelId !== product.appId && current.appUserModelId !== appId) throw new Error('W1 Start Menu shortcut is owned by another application')
    const backup = join(directory, 'backups', new Date().toISOString().replaceAll(':', '-'))
    mkdirSync(backup, { recursive: true })
    copyFileSync(shortcut, join(backup, 'start-menu.lnk'))
  }
  mkdirSync(programs, { recursive: true })
  if (!desktopShell.writeShortcutLink(shortcut, 'create', {
    target: launcher, args: '', cwd: directory, icon, iconIndex: 0, appUserModelId: appId,
    description: product.name,
  })) throw new Error('Windows could not update the W1 Start Menu shortcut')
}
