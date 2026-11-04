/** Keep W1 Windows window, taskbar, tray and shortcut icons on the white-background artwork. */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import type { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { App, BrowserWindow, Shell } from 'electron'
import type { DesktopTray } from './tray.ts'

type IconWindow = Pick<BrowserWindow, 'setIcon' | 'setAppDetails' | 'isDestroyed'>

/** Inputs owned by the desktop main process; resources contain the Windows icon assets. */
export interface W1SystemIconsOptions {
  readonly app: Pick<App, 'getPath'> & Pick<EventEmitter, 'on' | 'off'>
  readonly shell: Pick<Shell, 'readShortcutLink' | 'writeShortcutLink'>
  readonly resources: string
  readonly appId: string
  readonly windows: () => IconWindow[]
  readonly tray: Pick<DesktopTray, 'setIcon'> | undefined
  readonly report: (error: unknown) => void
  readonly shortcuts?: boolean
}

/**
 * File shared by W1 Windows windows, the taskbar, the notification area and shortcuts.
 * @param resources - Directory containing the Windows icon assets.
 * @returns The white-background artwork, whose background is opaque.
 */
export function w1SystemIconPath(resources: string): string {
  return join(resources, 'w1-app-light.ico')
}

/**
 * Apply the white-background icon to W1 windows, the tray entry, shortcut files, and windows created later.
 * @param options - Desktop services and the installed icon directory.
 * @returns cleanup for the window-creation listener, called when the desktop quits.
 */
export function applyW1SystemIcons(options: W1SystemIconsOptions): () => void {
  const { app, shell } = options
  const icon = w1SystemIconPath(options.resources)
  const shortcuts = options.shortcuts === false ? [] : [
    join(app.getPath('desktop'), 'W1 Harness.lnk'),
    join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'W1 Harness.lnk'),
    join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', 'W1 Harness.lnk'),
  ]
  const applyWindow = (window: IconWindow): void => {
    if (window.isDestroyed()) return
    window.setIcon(icon)
    window.setAppDetails({ appIconPath: icon, appIconIndex: 0 })
  }
  if (!existsSync(icon)) {
    options.report(new Error(`W1 system icon is missing: ${icon}`))
  } else {
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
  const created = (_event: Electron.Event, window: BrowserWindow): void => { applyWindow(window) }
  app.on('browser-window-created', created)
  return () => { app.off('browser-window-created', created) }
}
