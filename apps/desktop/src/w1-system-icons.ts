/** Keep W1 taskbar, tray and shortcut icons on the same application color scheme. */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import type { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { App, BrowserWindow, Shell } from 'electron'
import type { DesktopTray } from './tray.ts'

type IconWindow = Pick<BrowserWindow, 'setIcon' | 'setAppDetails' | 'isDestroyed' | 'hookWindowMessage' | 'unhookWindowMessage'> & Pick<EventEmitter, 'once'>

/** Inputs owned by the desktop main process; resources contain both application icon palettes. */
export interface W1SystemIconsOptions {
  readonly app: Pick<App, 'getPath'> & Pick<EventEmitter, 'on' | 'off'>
  readonly theme: Pick<EventEmitter, 'on' | 'off'>
  readonly readDark: () => boolean
  readonly shell: Pick<Shell, 'readShortcutLink' | 'writeShortcutLink'>
  readonly resources: string
  readonly appId: string
  readonly windows: () => IconWindow[]
  readonly tray: Pick<DesktopTray, 'setIcon'> | undefined
  readonly report: (error: unknown) => void
}

/**
 * Update windows, tray and existing W1 shortcuts on startup and application theme changes.
 * @param options - Desktop services and the installed icon directory.
 * @returns event cleanup, called when the desktop quits.
 */
export function watchW1SystemIcons(options: W1SystemIconsOptions): () => void {
  const { app, theme, shell } = options
  let dark = options.readDark()
  const shortcuts = [
    join(app.getPath('desktop'), 'W1 Harness.lnk'),
    join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'W1 Harness.lnk'),
    join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', 'W1 Harness.lnk'),
  ]
  const iconPath = (): string => join(options.resources, dark ? 'w1-app-dark.ico' : 'w1-app-light.ico')
  const applyWindow = (window: IconWindow): void => {
    if (window.isDestroyed()) return
    const icon = iconPath()
    window.setIcon(icon)
    window.setAppDetails({ appIconPath: icon, appIconIndex: 0 })
  }
  const update = (): void => {
    dark = options.readDark()
    const icon = iconPath()
    if (!existsSync(icon)) { options.report(new Error(`W1 system icon is missing: ${icon}`)); return }
    for (const window of options.windows()) applyWindow(window)
    options.tray?.setIcon(icon)
    for (const [index, path] of shortcuts.entries()) {
      if (!existsSync(path)) continue
      try {
        const current = shell.readShortcutLink(path)
        if (current.appUserModelId !== options.appId || current.icon === icon) continue
        const backup = join(app.getPath('userData'), 'shortcut-icon-backups')
        mkdirSync(backup, { recursive: true })
        const before = join(backup, `${index}.lnk`)
        if (!existsSync(before)) copyFileSync(path, before)
        if (!shell.writeShortcutLink(path, 'update', { ...current, icon, iconIndex: 0 })) throw new Error(`Cannot update W1 shortcut icon: ${path}`)
      } catch (error) { options.report(error) }
    }
  }
  const watched = new Set<IconWindow>()
  const watch = (window: IconWindow): void => {
    if (window.isDestroyed() || watched.has(window)) return
    watched.add(window)
    // Re-evaluate on Windows settings changes as well as nativeTheme updates.
    window.hookWindowMessage(0x001A, update)
    window.once('closed', () => { watched.delete(window) })
  }
  const created = (_event: Electron.Event, window: BrowserWindow): void => { watch(window); applyWindow(window) }
  for (const window of options.windows()) watch(window)
  update()
  theme.on('updated', update)
  app.on('browser-window-created', created)
  return () => {
    theme.off('updated', update); app.off('browser-window-created', created)
    for (const window of watched) if (!window.isDestroyed()) window.unhookWindowMessage(0x001A)
    watched.clear()
  }
}
