import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ShortcutDetails } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { applyW1SystemIcons, prepareW1SystemIcon, w1SystemIconPath } from '../src/w1-system-icons.ts'

const product = { appId: 'local.w1.harness', name: 'W1 Harness' }
afterEach(() => { vi.unstubAllEnvs() })

it('uses transparent system-theme icons, preserves shortcut identity and removes both listeners', () => {
  const root = mkdtempSync(join(tmpdir(), 'w1-system-icons-'))
  try {
    for (const color of ['light', 'dark']) writeFileSync(join(root, `w1-app-${color}.ico`), color)
    writeFileSync(join(root, 'W1 Harness.lnk'), 'original shortcut')
    const app = Object.assign(new EventEmitter(), { isPackaged: true, getPath: () => root })
    const window = Object.assign(new EventEmitter(), { setIcon: vi.fn(), setAppDetails: vi.fn(), isDestroyed: () => false })
    const tray = { setIcon: vi.fn() }
    let shortcut: ShortcutDetails = { target: 'launcher.exe', appUserModelId: product.appId, icon: 'old.ico',
      args: '--keep', toastActivatorClsid: 'preserved-id' }
    const shell = { readShortcutLink: vi.fn(() => shortcut),
      writeShortcutLink: vi.fn((_path: string, operation: string | ShortcutDetails, details?: ShortcutDetails) => {
        shortcut = { ...shortcut, ...(typeof operation === 'string' ? details : operation) }
        return true
      }) }
    const report = vi.fn()
    const theme = Object.assign(new EventEmitter(), { shouldUseDarkColorsForSystemIntegratedUI: false })
    const cache = join(root, 'system-icons')
    const icon = prepareW1SystemIcon(root, cache, false)
    expect(w1SystemIconPath(root, false)).toBe(join(root, 'w1-app-light.ico'))
    const dispose = applyW1SystemIcons({ app, shell, theme, resources: root, product,
      windows: () => [window], tray, report })
    expect(window.setIcon).toHaveBeenLastCalledWith(icon)
    expect(window.setAppDetails).toHaveBeenLastCalledWith({ appIconPath: icon, appIconIndex: 0 })
    expect(tray.setIcon).toHaveBeenLastCalledWith(icon)
    expect(shell.writeShortcutLink).toHaveBeenLastCalledWith(join(root, 'W1 Harness.lnk'), 'update', {
      target: shortcut.target, icon, iconIndex: 0,
    })
    expect(shortcut).toMatchObject({ args: '--keep', toastActivatorClsid: 'preserved-id' })
    expect(readFileSync(join(root, 'shortcut-icon-backups/0.lnk'), 'utf8')).toBe('original shortcut')
    const another = Object.assign(new EventEmitter(), { setIcon: vi.fn(), setAppDetails: vi.fn(), isDestroyed: () => false })
    app.emit('browser-window-created', {}, another)
    expect(another.setIcon).toHaveBeenCalledWith(icon)
    theme.shouldUseDarkColorsForSystemIntegratedUI = true
    theme.emit('updated')
    expect(window.setIcon).toHaveBeenLastCalledWith(prepareW1SystemIcon(root, cache, true))
    expect(tray.setIcon).toHaveBeenLastCalledWith(prepareW1SystemIcon(root, cache, true))
    dispose()
    expect(theme.listenerCount('updated')).toBe(0)
    expect(app.listenerCount('browser-window-created')).toBe(0)
    expect(report).not.toHaveBeenCalled()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it.skipIf(process.platform !== 'win32').each(['create', 'replace'] as const)(
  'keeps the permanent launcher and retained icon after Start Menu %s and another startup', (operation) => {
    const root = mkdtempSync(join(tmpdir(), 'w1-start-menu-'))
    try {
      const launcher = join(root, 'W1 Harness.exe')
      writeFileSync(launcher, '')
      writeFileSync(join(root, 'w1-app-light.ico'), 'fixture')
      vi.stubEnv('W1_TEST_MODE', undefined)
      vi.stubEnv('W1_DESKTOP_LAUNCHER', launcher)
      const path = join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'W1 Harness.lnk')
      const icon = prepareW1SystemIcon(root, join(root, 'icons'), false)
      const appId = `${product.appId}.dev`
      let shortcut: ShortcutDetails = { target: join(root, 'shell', '44.7.0', 'W1 Harness.exe'), appUserModelId: appId, icon, iconIndex: 0 }
      if (operation === 'replace') {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, 'versioned target')
      }
      const shell = { readShortcutLink: vi.fn(() => shortcut),
        writeShortcutLink: vi.fn((file: string, mode: string | ShortcutDetails, details?: ShortcutDetails) => {
          const updated = typeof mode === 'string' ? details : mode
          if (updated === undefined) return false
          writeFileSync(file, 'permanent target')
          shortcut = updated
          return true
        }) }
      const window = { setIcon: vi.fn(), setAppDetails: vi.fn(), isDestroyed: () => false }
      const options = { app: Object.assign(new EventEmitter(), { isPackaged: false, getPath: () => root }),
        shell, theme: Object.assign(new EventEmitter(), { shouldUseDarkColorsForSystemIntegratedUI: false }),
        resources: root, product, windows: () => [window], tray: undefined, report: vi.fn() }
      applyW1SystemIcons(options)()
      applyW1SystemIcons(options)()
      expect(options.report).not.toHaveBeenCalled()
      expect(shell.writeShortcutLink).toHaveBeenCalledTimes(1)
      expect(shell.writeShortcutLink).toHaveBeenCalledWith(path, operation, expect.objectContaining({
        target: launcher, appUserModelId: appId, icon, iconIndex: 0,
      }))
      expect(window.setAppDetails).toHaveBeenLastCalledWith({ appId, appIconPath: icon, appIconIndex: 0,
        relaunchCommand: '"' + launcher + '"', relaunchDisplayName: product.name })
      if (operation === 'replace') expect(readFileSync(join(root, 'shortcut-icon-backups/1.lnk'), 'utf8')).toBe('versioned target')
    } finally { rmSync(root, { recursive: true, force: true }) }
  },
)

it('leaves another application shortcut untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'w1-system-icons-'))
  try {
    writeFileSync(join(root, 'w1-app-light.ico'), 'fixture')
    writeFileSync(join(root, 'W1 Harness.lnk'), 'unrelated')
    const shell = { readShortcutLink: vi.fn(() => ({ target: 'other.exe', appUserModelId: 'other', icon: 'other.ico' })),
      writeShortcutLink: vi.fn(() => true) }
    const dispose = applyW1SystemIcons({ app: Object.assign(new EventEmitter(), { isPackaged: true, getPath: () => root }),
      shell, theme: Object.assign(new EventEmitter(), { shouldUseDarkColorsForSystemIntegratedUI: false }),
      resources: root, product, windows: () => [], tray: undefined, report: vi.fn() })
    expect(shell.writeShortcutLink).not.toHaveBeenCalled()
    dispose()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('reports a missing icon without touching windows, the tray or shortcuts', () => {
  const root = mkdtempSync(join(tmpdir(), 'w1-system-icons-'))
  try {
    writeFileSync(join(root, 'W1 Harness.lnk'), 'original shortcut')
    const window = { setIcon: vi.fn(), setAppDetails: vi.fn(), isDestroyed: () => false }
    const tray = { setIcon: vi.fn() }
    const shell = { readShortcutLink: vi.fn(), writeShortcutLink: vi.fn(() => true) }
    const report = vi.fn()
    const dispose = applyW1SystemIcons({ app: Object.assign(new EventEmitter(), { isPackaged: true, getPath: () => root }), shell,
      theme: Object.assign(new EventEmitter(), { shouldUseDarkColorsForSystemIntegratedUI: false }),
      resources: root, product, windows: () => [window], tray, report })
    expect(report).toHaveBeenCalledTimes(1)
    expect((report.mock.calls[0]![0] as Error).message).toBe(`W1 system icon is missing: ${join(root, 'w1-app-light.ico')}`)
    expect(window.setIcon).not.toHaveBeenCalled()
    expect(tray.setIcon).not.toHaveBeenCalled()
    expect(shell.writeShortcutLink).not.toHaveBeenCalled()
    dispose()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('gives changed artwork a new Windows cache path and retains the previous bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'w1-icon-revision-'))
  try {
    const source = join(root, 'w1-app-light.ico')
    writeFileSync(source, 'previous artwork')
    const before = prepareW1SystemIcon(root, root, false)
    writeFileSync(source, 'new artwork')
    const after = prepareW1SystemIcon(root, root, false)
    expect(after).not.toBe(before)
    expect(readFileSync(before, 'utf8')).toBe('previous artwork')
    expect(readFileSync(after, 'utf8')).toBe('new artwork')
    expect(prepareW1SystemIcon(root, root, false)).toBe(after)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
