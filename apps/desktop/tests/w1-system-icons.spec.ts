import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { watchW1SystemIcons } from '../src/w1-system-icons.ts'

it('follows the app theme for both taskbar and tray, preserves shortcut identity, updates new windows and removes listeners', () => {
  const root = mkdtempSync(join(tmpdir(), 'w1-system-icons-'))
  try {
    for (const color of ['light', 'dark']) writeFileSync(join(root, `w1-app-${color}.ico`), 'fixture')
    writeFileSync(join(root, 'W1 Harness.lnk'), 'original shortcut')
    const app = Object.assign(new EventEmitter(), { getPath: () => root })
    const theme = Object.assign(new EventEmitter(), { shouldUseDarkColors: true })
    let settingsChanged = (): void => {}
    const window = Object.assign(new EventEmitter(), { setIcon: vi.fn(), setAppDetails: vi.fn(), isDestroyed: () => false,
      hookWindowMessage: vi.fn((_message: number, callback: () => void) => { settingsChanged = callback }), unhookWindowMessage: vi.fn() })
    const tray = { setIcon: vi.fn() }
    const shortcut = { target: 'launcher.exe', appUserModelId: 'local.w1.harness.dev', icon: 'old.ico',
      args: '--keep', toastActivatorClsid: 'preserved-id' }
    const shell = { readShortcutLink: vi.fn(() => shortcut), writeShortcutLink: vi.fn(() => true) }
    const report = vi.fn()
    const dispose = watchW1SystemIcons({ app, theme, shell, readDark: () => theme.shouldUseDarkColors,
      resources: root, appId: shortcut.appUserModelId,
      windows: () => [window], tray, report })
    expect(tray.setIcon).toHaveBeenLastCalledWith(join(root, 'w1-app-dark.ico'))
    expect(shell.writeShortcutLink).toHaveBeenLastCalledWith(join(root, 'W1 Harness.lnk'), 'update', {
      ...shortcut, icon: join(root, 'w1-app-dark.ico'), iconIndex: 0,
    })
    expect(readFileSync(join(root, 'shortcut-icon-backups/0.lnk'), 'utf8')).toBe('original shortcut')
    theme.shouldUseDarkColors = false
    settingsChanged()
    expect(window.setIcon).toHaveBeenLastCalledWith(join(root, 'w1-app-light.ico'))
    expect(tray.setIcon).toHaveBeenLastCalledWith(join(root, 'w1-app-light.ico'))
    const another = Object.assign(new EventEmitter(), { setIcon: vi.fn(), setAppDetails: vi.fn(), isDestroyed: () => false,
      hookWindowMessage: vi.fn(), unhookWindowMessage: vi.fn() })
    app.emit('browser-window-created', {}, another)
    expect(another.setIcon).toHaveBeenCalledWith(join(root, 'w1-app-light.ico'))
    dispose()
    expect(theme.listenerCount('updated')).toBe(0)
    expect(app.listenerCount('browser-window-created')).toBe(0)
    expect(window.unhookWindowMessage).toHaveBeenCalledWith(0x001A)
    expect(report).not.toHaveBeenCalled()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('leaves another application shortcut untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'w1-system-icons-'))
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'w1-app-dark.ico'), 'fixture')
    writeFileSync(join(root, 'W1 Harness.lnk'), 'unrelated')
    const shell = { readShortcutLink: vi.fn(() => ({ target: 'other.exe', appUserModelId: 'other', icon: 'other.ico' })),
      writeShortcutLink: vi.fn(() => true) }
    const dispose = watchW1SystemIcons({ app: Object.assign(new EventEmitter(), { getPath: () => root }),
      theme: Object.assign(new EventEmitter(), { shouldUseDarkColors: true }),
      readDark: () => true,
      shell, resources: root, appId: 'w1', windows: () => [], tray: undefined, report: vi.fn() })
    expect(shell.writeShortcutLink).not.toHaveBeenCalled()
    dispose()
  } finally { rmSync(root, { recursive: true, force: true }) }
})
