import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureW1StartMenu, configureW1Taskbar, isW1Development } from '../src/w1-identity.ts'
import type { W1Product } from '../src/w1-upstream.ts'

const product: W1Product = { name: 'W1 Harness', appId: 'local.w1.harness', protocol: 'w1-harness',
  version: '0.1.0-alpha.2', upstreamTag: 'dsh-v0.2.1-rc.1', upstreamPublishedAt: '2026-10-17T05:22:10Z' }
const owned: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe.skipIf(process.platform !== 'win32')('W1 Windows taskbar relaunch', () => {
  it('reopens the development launcher with spaces as one executable and shares the shortcut identity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'w1-taskbar-'))
    owned.push(directory)
    const launcher = join(directory, 'W1 Harness.exe')
    writeFileSync(launcher, '')
    const icon = join(directory, 'w1-app.ico')
    writeFileSync(icon, '')
    vi.stubEnv('W1_DESKTOP_LAUNCHER', launcher)
    const window = { setIcon: vi.fn(), setAppDetails: vi.fn() }
    configureW1Taskbar({ isPackaged: false, getAppPath: () => directory }, window, product)
    expect(window.setAppDetails).toHaveBeenCalledWith({ appId: `${product.appId}.dev`, appIconPath: icon,
      appIconIndex: 0, relaunchCommand: '"' + launcher + '"', relaunchDisplayName: product.name })
  })
  it('registers the Start Menu in the current process context without redirecting the launcher into AppData', () => {
    const directory = mkdtempSync(join(tmpdir(), 'w1-start-menu-'))
    owned.push(directory)
    const launcher = join(directory, 'W1 Harness.exe')
    writeFileSync(launcher, '')
    vi.stubEnv('W1_DESKTOP_LAUNCHER', launcher)
    const desktopShell = { readShortcutLink: vi.fn(), writeShortcutLink: vi.fn(() => true) }
    configureW1StartMenu({ isPackaged: false, getPath: () => directory }, desktopShell, product)
    expect(desktopShell.writeShortcutLink).toHaveBeenCalledWith(
      join(directory, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'W1 Harness.lnk'), 'create',
      expect.objectContaining({ target: launcher, appUserModelId: `${product.appId}.dev` }),
    )
  })
  it('keeps a renamed W1 development executable on development runtime paths', () => {
    vi.stubEnv('W1_DESKTOP_EXECUTABLE', process.execPath)
    expect(isW1Development({ isPackaged: true })).toBe(true)
  })
  it('does not apply an unrelated inherited executable override to a packaged application', () => {
    vi.stubEnv('W1_DESKTOP_EXECUTABLE', join(tmpdir(), 'another-app.exe'))
    expect(isW1Development({ isPackaged: true })).toBe(false)
  })
  it('does not redirect packaged applications through an inherited development launcher', () => {
    vi.stubEnv('W1_DESKTOP_LAUNCHER', process.execPath)
    const window = { setIcon: vi.fn(), setAppDetails: vi.fn() }
    configureW1Taskbar({ isPackaged: true, getAppPath: () => tmpdir() }, window, product)
    expect(window.setAppDetails).not.toHaveBeenCalled()
  })
  it('keeps ordinary development startup usable when no launcher is installed', () => {
    vi.stubEnv('W1_DESKTOP_LAUNCHER', undefined)
    const window = { setIcon: vi.fn(), setAppDetails: vi.fn() }
    configureW1Taskbar({ isPackaged: false, getAppPath: () => tmpdir() }, window, product)
    expect(window.setAppDetails).not.toHaveBeenCalled()
    expect(window.setIcon).toHaveBeenCalledOnce()
  })
})
