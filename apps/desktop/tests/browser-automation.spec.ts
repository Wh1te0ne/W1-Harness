/** Private browser operations with fake webContents; no native desktop access. */
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { DesktopBrowserLeaseId } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { BrowserAutomation } from '../src/browser-automation.ts'

const limits = { timeoutMs: 1000, maxTextChars: 12000, maxElements: 100 }
const tab = 'tab-1' as DesktopBrowserLeaseId
function fixture() {
  let attached = false
  const guest = Object.assign(new EventEmitter(), {
    getURL: vi.fn(() => 'https://example.test/'), getTitle: () => 'Example', isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: vi.fn(async () => ({ text: 'hello' })),
    loadURL: vi.fn(async (_url: string) => {}), sendInputEvent: vi.fn(),
    debugger: { isAttached: vi.fn(() => attached), attach: vi.fn(() => { attached = true }),
      detach: vi.fn(() => { attached = false }), sendCommand: vi.fn(async (_method: string, _params: object) => {}) },
    navigationHistory: { canGoBack: () => false, goBack: vi.fn() },
  })
  const open = vi.fn<(sessionId: string, requestId: string, url: string) => void>()
  const automation = new BrowserAutomation(url => url.startsWith('https://') && !url.startsWith('https://app.test'), open)
  const owner = { executeJavaScriptInIsolatedWorld: vi.fn(async () => {}), isDestroyed: () => false }
  const release = automation.attach(tab, { sessionId: 'owner' }, guest as never, owner as never)
  const run = (command: object, session = 'owner', signal = new AbortController().signal) => automation.execute(session, command, limits, signal)
  return { guest, owner, automation, run, open, release }
}

describe('built-in browser ownership and delivery', () => {
  it('lists only this conversation and rejects cross-session direct actions', async () => {
    const f = fixture()
    expect(JSON.parse((await f.run({ action: 'list' })).text)).toMatchObject([{ tab, enabled: true }])
    expect((await f.run({ action: 'list' }, 'other')).text).toBe('[]')
    await expect(f.run({ action: 'fill', tab, ref: 'r', text: 'x' }, 'other')).rejects.toMatchObject({ code: 'tab-unavailable' })
    expect(f.guest.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled()
  })
  it('refuses application URLs, malformed commands and missing history without delivery', async () => {
    const f = fixture()
    await expect(f.run({ action: 'navigate', tab, url: 'https://app.test/' })).rejects.toMatchObject({ code: 'blocked-url' })
    await expect(f.run({ action: 'click', tab })).rejects.toThrow()
    await expect(f.run({ action: 'back', tab })).rejects.toMatchObject({ code: 'no-history' })
    expect(f.guest.sendInputEvent).not.toHaveBeenCalled()
    expect(f.guest.loadURL).not.toHaveBeenCalled()
  })
  it('pauses a pending observation and keeps the tab busy until it settles', async () => {
    const f = fixture()
    const pending = Promise.withResolvers<{ text: string }>()
    f.guest.executeJavaScriptInIsolatedWorld.mockReturnValueOnce(pending.promise)
    const running = f.run({ action: 'read', tab })
    f.automation.setEnabled(tab, false)
    await expect(running).rejects.toMatchObject({ code: 'paused' })
    await expect(f.run({ action: 'press', tab, key: 'Enter' })).rejects.toMatchObject({ code: 'paused' })
    f.automation.setEnabled(tab, true)
    await expect(f.run({ action: 'read', tab })).rejects.toMatchObject({ code: 'busy' })
    pending.resolve({ text: 'late' })
    await vi.waitFor(async () => { expect((await f.run({ action: 'read', tab })).text).toContain('hello') })
    expect(f.guest.sendInputEvent).not.toHaveBeenCalled()
  })
  it('does not deliver a click when cancellation arrives during element lookup', async () => {
    const f = fixture()
    const pending = Promise.withResolvers<never>()
    f.guest.executeJavaScriptInIsolatedWorld.mockReturnValueOnce(pending.promise)
    const lifetime = new AbortController()
    const running = f.run({ action: 'click', tab, ref: 'r' }, 'owner', lifetime.signal)
    await vi.waitFor(() => { expect(f.guest.executeJavaScriptInIsolatedWorld).toHaveBeenCalled() })
    lifetime.abort()
    await expect(running).rejects.toThrow()
    pending.reject(new Error('cancelled lookup'))
    await Promise.resolve()
    expect(f.guest.sendInputEvent).not.toHaveBeenCalled()
  })
  it('resolves a created tab only after its exact request and conversation are ready', async () => {
    const f = fixture()
    const running = f.run({ action: 'open', url: 'https://example.test/' })
    const [, requestId] = f.open.mock.calls[0]!
    const wrong = Object.assign(new EventEmitter(), { getURL: () => 'https://example.test/' })
    f.automation.attach('wrong' as DesktopBrowserLeaseId, { sessionId: 'other', requestId }, wrong as never, f.owner as never)
    wrong.emit('did-finish-load')
    f.automation.attach('created' as DesktopBrowserLeaseId, { sessionId: 'owner', requestId }, f.guest as never, f.owner as never)
    f.guest.emit('did-finish-load')
    expect(JSON.parse((await running).text)).toMatchObject({ tab: 'created' })
    f.release()
    await expect(f.run({ action: 'read', tab })).rejects.toMatchObject({ code: 'tab-unavailable' })
  })
  it('returns input delivery separately from outcome verification', async () => {
    const f = fixture()
    f.guest.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce({ x: 25, y: 30 } as never)
    const result = await f.run({ action: 'click', tab, ref: 'snapshot:1' })
    expect(f.guest.debugger.sendCommand.mock.calls).toEqual([
      ['Input.dispatchMouseEvent', { type: 'mousePressed', x: 25, y: 30, button: 'left', clickCount: 1, buttons: 1 }],
      ['Input.dispatchMouseEvent', { type: 'mouseReleased', x: 25, y: 30, button: 'left', clickCount: 1, buttons: 0 }],
    ])
    expect(f.guest.debugger.detach).toHaveBeenCalledOnce()
    expect(f.guest.sendInputEvent).not.toHaveBeenCalled()
    expect(JSON.parse(result.text)).toMatchObject({ delivered: true, message: 'Input delivered; use read or screenshot to verify the result.' })
  })
  it('rejects input when the page navigates during element lookup', async () => {
    const f = fixture()
    f.guest.executeJavaScriptInIsolatedWorld.mockImplementationOnce(async () => {
      f.guest.emit('did-start-navigation')
      return { x: 25, y: 30 } as never
    })
    await expect(f.run({ action: 'click', tab, ref: 'r' })).rejects.toMatchObject({ code: 'page-changed' })
    expect(f.guest.sendInputEvent).not.toHaveBeenCalled()
  })
  it('refuses an occupied debugger without sending input or detaching another client', async () => {
    const f = fixture()
    f.guest.debugger.isAttached.mockReturnValue(true)
    await expect(f.run({ action: 'press', tab, key: 'Enter' })).rejects.toMatchObject({ code: 'debugger-busy' })
    expect(f.guest.debugger.sendCommand).not.toHaveBeenCalled()
    expect(f.guest.debugger.detach).not.toHaveBeenCalled()
  })
})
