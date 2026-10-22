import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { configureW1Identity, configureW1StartMenu, configureW1Taskbar, isW1Development, relaunchW1 } from '../src/w1-identity.ts'
import type { W1Product } from '../src/w1-upstream.ts'

const product: W1Product = { name: 'W1 Harness', appId: 'local.w1.harness', protocol: 'w1-harness',
  version: '0.1.0-alpha.2', upstreamTag: 'dsh-v0.2.1-rc.1', upstreamPublishedAt: '2026-10-17T05:22:10Z' }
const owned: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe.skipIf(process.platform !== 'win32')('W1 Windows taskbar relaunch', () => {
  it('reopens source Test through its queue-aware launcher rather than as a packaged executable', () => {
    const directory = mkdtempSync(join(tmpdir(), 'w1-source-test-pin-'))
    owned.push(directory)
    const launcher = join(directory, 'Start-W1Test.ps1'), powershell = join(directory, 'pwsh.exe')
    writeFileSync(launcher, '')
    writeFileSync(powershell, '')
    vi.stubEnv('W1_TEST_MODE', '1')
    vi.stubEnv('W1_TEST_LAUNCHER', launcher)
    vi.stubEnv('W1_TEST_POWERSHELL', powershell)
    const window = { setIcon: vi.fn(), setAppDetails: vi.fn<BrowserWindow['setAppDetails']>() }
    configureW1Taskbar({ isPackaged: false, getAppPath: () => directory }, window, { ...product, name: 'W1 Harness Test' })
    expect(window.setAppDetails.mock.calls[0]?.[0].relaunchCommand).toContain('"' + launcher + '"')
    expect(window.setAppDetails.mock.calls[0]?.[0].relaunchCommand).not.toContain('-Executable')
    const relaunch = vi.fn()
    relaunchW1({ isPackaged: false, relaunch })
    expect(relaunch).toHaveBeenCalledWith({ execPath: powershell,
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', launcher] })
  })
  it('keeps a packaged test pin on the isolated launcher after its original environment is gone', () => {
    const directory = mkdtempSync(join(tmpdir(), 'w1-test-pin-'))
    owned.push(directory)
    const launcher = join(directory, 'Start W1 Test.ps1'), powershell = join(directory, 'pwsh.exe')
    writeFileSync(launcher, '')
    writeFileSync(powershell, '')
    vi.stubEnv('W1_TEST_MODE', '1')
    vi.stubEnv('W1_TEST_LAUNCHER', launcher)
    vi.stubEnv('W1_TEST_POWERSHELL', powershell)
    vi.stubEnv('W1_DESKTOP_EXECUTABLE', undefined)
    const window = { setIcon: vi.fn(), setAppDetails: vi.fn() }
    const identity = { ...product, name: 'W1 Harness Test', appId: 'local.w1.harness.test' }
    configureW1Taskbar({ isPackaged: true, getAppPath: () => directory }, window, identity)
    expect(window.setAppDetails).toHaveBeenCalledWith({ appId: identity.appId, appIconPath: process.execPath,
      appIconIndex: 0, relaunchCommand: '"' + powershell
        + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + launcher
        + '" -Executable "' + process.execPath + '"', relaunchDisplayName: identity.name })
  })
  it('isolates test identity and paths even with inherited daily overrides, without touching daily shortcuts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'w1-identity-'))
    owned.push(directory)
    writeFileSync(join(directory, 'w1-product.json'), JSON.stringify(product))
    const home = join(directory, 'home'), appData = join(directory, 'appData')
    mkdirSync(home)
    mkdirSync(appData)
    for (const name of ['DSH_HOME', 'DSH_AGENTS_HOME', 'W1_DOCUMENTS_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
      'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'BILI_CONFIG_FILE', 'BILI_SESSIONS_DIR', 'BILI_ZONE_PORT',
      'BILI_NATIVE_ATTACH_EXTERNAL', 'BILLION_CONTEXT_ATTACH', 'BILLION_CONTEXT_PROXY']) vi.stubEnv(name, process.env[name])
    vi.stubEnv('W1_TEST_MODE', '1')
    vi.stubEnv('W1_HOME', join(home, '.w1-harness'))
    vi.stubEnv('W1_USER_DATA', join(appData, product.name))
    const application = { isPackaged: true, getAppPath: () => directory,
      getPath: (name: string) => name === 'home' ? home : appData,
      setName: vi.fn(), setPath: vi.fn(), setAppUserModelId: vi.fn() }
    const identity = configureW1Identity(application)
    expect(identity).toMatchObject({ name: 'W1 Harness Test', appId: 'local.w1.harness.test' })
    expect(application.setPath).toHaveBeenCalledWith('userData', join(appData, 'W1 Harness Test'))
    expect(process.env.DSH_HOME).toBe(join(home, '.w1-harness-test'))
    expect(process.env.BILI_ZONE_PORT).toBe('28788')
    expect(existsSync(join(home, '.w1-harness'))).toBe(false)
    expect(existsSync(join(appData, product.name))).toBe(false)
    const window = { setIcon: vi.fn(), setAppDetails: vi.fn() }
    const desktopShell = { readShortcutLink: vi.fn(), writeShortcutLink: vi.fn(() => true) }
    configureW1Taskbar(application, window, identity)
    configureW1StartMenu(application, desktopShell, identity)
    expect(window.setAppDetails).not.toHaveBeenCalled()
    expect(desktopShell.writeShortcutLink).not.toHaveBeenCalled()
  })
  it('restarts development through the publisher launcher without inherited application arguments', () => {
    const directory = mkdtempSync(join(tmpdir(), 'w1-relaunch-'))
    owned.push(directory)
    const launcher = join(directory, 'W1 Harness.exe')
    writeFileSync(launcher, '')
    vi.stubEnv('W1_DESKTOP_LAUNCHER', launcher)
    const relaunch = vi.fn()
    relaunchW1({ isPackaged: false, relaunch })
    expect(relaunch).toHaveBeenCalledWith({ execPath: launcher, args: [] })
    relaunch.mockClear()
    relaunchW1({ isPackaged: true, relaunch })
    expect(relaunch).toHaveBeenCalledWith()
  })
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
