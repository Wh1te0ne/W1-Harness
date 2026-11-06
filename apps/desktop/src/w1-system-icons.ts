/** Keep W1 native icons transparent and give Windows a new cache key for each artwork revision. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { EventEmitter } from 'node:events'
import { dirname, join } from 'node:path'
import type { App, BrowserWindow, NativeTheme, Shell } from 'electron'
import type { DesktopTray } from './tray.ts'
import { configureW1Taskbar, isW1Development, w1DevelopmentLauncher } from './w1-identity.ts'
import type { W1Product } from './w1-upstream.ts'

type IconWindow = Pick<BrowserWindow, 'setIcon' | 'setAppDetails' | 'isDestroyed'>

/** Inputs owned by the desktop main process; resources contain the Windows icon assets. */
export interface W1SystemIconsOptions {
  readonly app: Pick<App, 'getPath' | 'isPackaged'> & Pick<EventEmitter, 'on' | 'off'>
  readonly shell: Pick<Shell, 'readShortcutLink' | 'writeShortcutLink'>
  readonly theme: Pick<NativeTheme, 'shouldUseDarkColorsForSystemIntegratedUI'> & Pick<EventEmitter, 'on' | 'off'>
  readonly resources: string
  readonly product: Pick<W1Product, 'appId' | 'name'>
  readonly windows: () => IconWindow[]
  readonly tray: Pick<DesktopTray, 'setIcon'> | undefined
  readonly report: (error: unknown) => void
  readonly shortcuts?: boolean
}

/**
 * Local Windows shortcuts keep their icons beside the permanent launcher.
 * @param app - Application paths and packaging state.
 * @returns The retained icon directory for this installation.
 */
export function w1SystemIconDirectory(app: Pick<App, 'getPath' | 'isPackaged'>): string {
  const launcher = w1DevelopmentLauncher(app)
  return launcher === undefined ? join(app.getPath('userData'), 'system-icons') : join(dirname(launcher), 'icons')
}

/**
 * File shared by W1 Windows windows, the taskbar, the notification area and shortcuts.
 * @param resources - Directory containing the Windows icon assets.
 * @param dark - Whether Windows system surfaces use dark backgrounds.
 * @returns The transparent artwork for that system theme.
 */
export function w1SystemIconPath(resources: string, dark: boolean): string {
  return join(resources, `w1-app-${dark ? 'dark' : 'light'}.ico`)
}

/**
 * Preserve a content-named icon copy so Windows cannot reuse a previous revision's bitmap.
 * @param resources - Installed light and dark ICO directory, which is never written.
 * @param directory - Writable directory owning the retained icon copies.
 * @param dark - Whether Windows system surfaces use dark backgrounds.
 * @returns The retained icon path; older copies remain valid for existing shortcuts.
 * @throws If the selected icon cannot be read or its cache cannot be prepared.
 */
export function prepareW1SystemIcon(resources: string, directory: string, dark: boolean): string {
  const source = w1SystemIconPath(resources, dark)
  if (!existsSync(source)) throw new Error(`W1 system icon is missing: ${source}`)
  const digest = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 16)
  const icon = join(directory, `w1-app-${digest}.ico`)
  mkdirSync(directory, { recursive: true })
  if (!existsSync(icon)) copyFileSync(source, icon)
  return icon
}

/**
 * Apply transparent icons to native surfaces and refresh them when the Windows system theme changes.
 * @param options - Desktop services and the installed icon directory.
 * @returns Cleanup for the window and theme listeners. Preparation failures are reported before any icon changes.
 */
export function applyW1SystemIcons(options: W1SystemIconsOptions): () => void {
  const { app, shell, theme, product } = options
  const launcher = w1DevelopmentLauncher(app)
  const directory = w1SystemIconDirectory(app)
  const appId = isW1Development(app) ? `${product.appId}.dev` : product.appId
  const startMenu = options.shortcuts === false ? undefined
    : join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'W1 Harness.lnk')
  let icon: string | undefined
  const shortcuts = startMenu === undefined ? [] : [
    join(app.getPath('desktop'), 'W1 Harness.lnk'),
    startMenu,
    join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', 'W1 Harness.lnk'),
  ]
  const applyWindow = (window: IconWindow): void => {
    if (icon === undefined || window.isDestroyed()) return
    configureW1Taskbar(app, window, product, icon)
  }
  const apply = (): void => {
    try {
      icon = prepareW1SystemIcon(options.resources, directory, theme.shouldUseDarkColorsForSystemIntegratedUI)
    } catch (error) {
      options.report(error)
      return
    }
    for (const window of options.windows()) applyWindow(window)
    options.tray?.setIcon(icon)
    for (const [index, path] of shortcuts.entries()) {
      try {
        const current = existsSync(path) ? shell.readShortcutLink(path) : undefined
        if (current === undefined && (path !== startMenu || launcher === undefined)) continue
        if (current !== undefined && current.appUserModelId !== appId) continue
        const target = launcher ?? current?.target
        if (target === undefined) continue
        const retarget = current?.target.toLowerCase() !== target.toLowerCase()
        if (!retarget && current?.icon === icon && current.iconIndex === 0) continue
        if (current !== undefined) {
          const backup = join(app.getPath('userData'), 'shortcut-icon-backups')
          mkdirSync(backup, { recursive: true })
          const before = join(backup, `${index}.lnk`)
          if (!existsSync(before)) copyFileSync(path, before)
        } else {
          mkdirSync(dirname(path), { recursive: true })
        }
        const details = retarget ? {
          ...current, target, cwd: dirname(target), args: '', description: product.name, appUserModelId: appId,
        } : { target }
        const operation = current === undefined ? 'create' : retarget ? 'replace' : 'update'
        if (!shell.writeShortcutLink(path, operation, { ...details, icon, iconIndex: 0 })) throw new Error(`Cannot update W1 shortcut: ${path}`)
        const updated = shell.readShortcutLink(path)
        if (updated.appUserModelId !== appId || updated.icon !== icon || updated.iconIndex !== 0
          || updated.target.toLowerCase() !== target.toLowerCase()) {
          throw new Error(`Cannot verify W1 shortcut: ${path}`)
        }
      } catch (error) { options.report(error) }
    }
  }
  apply()
  const created = (_event: Electron.Event, window: BrowserWindow): void => { applyWindow(window) }
  app.on('browser-window-created', created)
  theme.on('updated', apply)
  return () => { app.off('browser-window-created', created); theme.off('updated', apply) }
}
