import { once } from 'node:events'
import { WebSocket } from 'ws'
import { expect, it, onTestFinished, vi } from 'vitest'
import { ChromeBridge } from '../src/bridge.ts'
import { bridgeReady, ExtensionConnection } from '../src/connection.ts'
import { EXTENSION_ORIGIN } from '../src/identity.ts'
import { fakeChrome } from './fake-chrome.ts'
import { pageResult, listResult } from './observations.ts'

const signal = () => new AbortController().signal

it('discovers a ready port automatically and explains a running incompatible service', async () => {
  const fake = fakeChrome()
  fake.settings.port = 9999
  const ready = vi.fn(async (_port: number): Promise<boolean | 'outdated'> => 'outdated')
  const socket = vi.fn((): globalThis.WebSocket => { throw new Error('No ready service') })
  const extension = new ExtensionConnection(fake.api, socket, ready, [30001, 30002])
  onTestFinished(() => { extension.dispose(); fake.dom.window.close() })
  await extension.initialize()
  await extension.reconnect()
  expect(ready.mock.calls.map(call => call[0])).toEqual([30001, 30002])
  expect(await extension.popup({ action: 'status' })).toMatchObject({ connected: false, status: 'update' })
  expect(socket).not.toHaveBeenCalled()
  await expect(extension.popup({ action: 'configure', port: 9999 })).rejects.toThrow()
})

it('waits without creating a WebSocket or discovering tabs until the desktop is available', async () => {
  const bridge = new ChromeBridge({ port: 0, connectWaitMs: 100, timeoutMs: 3000 })
  const port = await bridge.start()
  await bridge.dispose()
  const fake = fakeChrome()
  fake.settings.port = port
  const socket = vi.fn((url: string) => new WebSocket(url, { origin: EXTENSION_ORIGIN }) as unknown as globalThis.WebSocket)
  const extension = new ExtensionConnection(fake.api, socket, bridgeReady, [port])
  const replacement = new ChromeBridge({ port, connectWaitMs: 100, timeoutMs: 3000 })
  onTestFinished(async () => { extension.dispose(); await replacement.dispose(); fake.dom.window.close() })
  await extension.initialize()
  await extension.reconnect()
  expect(socket).not.toHaveBeenCalled()
  expect(extension.controller.list()).toEqual([])
  expect(await extension.popup({ action: 'status' })).toMatchObject({ connected: false, enabled: true })
  await replacement.start()
  await vi.waitFor(() => { expect(socket).toHaveBeenCalledOnce() }, { timeout: 4000 })
  expect(listResult((await replacement.request('chat', { action: 'connect' }, signal())).text).connected).toBe(true)
})

it('does not connect if paused while checking readiness', async () => {
  const fake = fakeChrome()
  const probe = Promise.withResolvers<boolean>()
  const ready = vi.fn((_port: number, _signal: AbortSignal) => probe.promise)
  const socket = vi.fn((): globalThis.WebSocket => { throw new Error('Unexpected socket') })
  const extension = new ExtensionConnection(fake.api, socket, ready)
  onTestFinished(() => { extension.dispose(); fake.dom.window.close() })
  await extension.initialize()
  const connecting = extension.reconnect()
  await extension.popup({ action: 'enable', enabled: false })
  expect(ready.mock.calls[0]?.[1].aborted).toBe(true)
  probe.resolve(true)
  await connecting
  expect(socket).not.toHaveBeenCalled()
})

it('limits readiness to the loopback endpoint and rejects ordinary webpage origins', async () => {
  const { port } = await fixture(false)
  expect(await bridgeReady(port, signal())).toBe(true)
  const rejected = await fetch(`http://127.0.0.1:${port}/w1-chrome/health`, { headers: { Origin: 'https://attacker.test' } })
  expect(rejected.status).toBe(404)
  expect(rejected.headers.get('access-control-allow-origin')).toBeNull()
})
async function fixture(enabled = true, timeoutMs = 3000) {
  const bridge = new ChromeBridge({ port: 0, connectWaitMs: 100, timeoutMs })
  const port = await bridge.start()
  const fake = fakeChrome()
  fake.settings.port = port
  fake.settings.enabled = enabled
  const extension = new ExtensionConnection(fake.api,
    url => new WebSocket(url, { origin: EXTENSION_ORIGIN }) as unknown as globalThis.WebSocket, bridgeReady, [port])
  onTestFinished(async () => { extension.dispose(); await bridge.dispose(); fake.dom.window.close() })
  await extension.initialize()
  await extension.reconnect()
  return { bridge, extension, fake, port }
}

it('connects without codes or selection, discovers tabs and isolates operation ownership', async () => {
  const { bridge, fake } = await fixture()
  const list = listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text)
  expect(list.tabs).toHaveLength(2)
  const tab = list.tabs[0]!.tab
  const read = pageResult((await bridge.request('chat-a', { action: 'read', tab }, signal())).text)
  await expect(bridge.request('chat-b', { action: 'read', tab }, signal())).rejects.toThrow('another conversation')
  await bridge.request('chat-a', { action: 'fill', tab, ref: read.page.elements[0]!.ref, text: 'automatic' }, signal())
  expect(fake.dom.window.document.querySelector('input')?.value).toBe('automatic')
  await bridge.request('chat-a', { action: 'disconnect' }, signal())
  await expect(bridge.request('chat-b', { action: 'read', tab }, signal())).resolves.toBeDefined()
  expect(listResult((await bridge.request('chat-b', { action: 'list', query: 'fixture' }, signal())).text).tabs).toHaveLength(1)
})

it('persists a user pause and reconnects automatically only after re-enabling', async () => {
  const { bridge, extension, fake } = await fixture(false)
  expect(listResult((await bridge.request('chat-a', { action: 'connect' }, signal())).text).connected).toBe(false)
  expect(fake.api.debugger.attach).not.toHaveBeenCalled()
  await extension.popup({ action: 'enable', enabled: true })
  await extension.reconnect()
  expect(listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text).connected).toBe(true)
  await extension.popup({ action: 'enable', enabled: false })
  expect(fake.settings.enabled).toBe(false)
  await vi.waitFor(async () => { expect(listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text).connected).toBe(false) })
})

it('propagates individual pause without disabling other pages', async () => {
  const { bridge, extension } = await fixture()
  const tab = listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text).tabs[0]!.tab
  await extension.popup({ action: 'pause', id: 1, paused: true })
  await vi.waitFor(async () => { expect(listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text).tabs[0]!.enabled).toBe(false) })
  await expect(bridge.request('chat-a', { action: 'read', tab }, signal())).rejects.toThrow('paused')
  await expect(bridge.request('chat-a', { action: 'open', url: 'https://new.test/' }, signal())).resolves.toBeDefined()
})

it('rejects ordinary webpage origins and the retired invitation protocol', async () => {
  const { bridge, port, extension } = await fixture()
  const wrong = new WebSocket(`ws://127.0.0.1:${port}/w1-chrome`, { origin: 'https://attacker.test' })
  expect(await once(wrong, 'error')).toHaveLength(1)
  extension.dispose()
  await vi.waitFor(async () => { expect(listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text).connected).toBe(false) })
  const old = new WebSocket(`ws://127.0.0.1:${port}/w1-chrome`, { origin: EXTENSION_ORIGIN })
  await once(old, 'open')
  const closed = once(old, 'close')
  old.send(JSON.stringify({ type: 'pair', code: 'retired' }))
  await closed
  expect(listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text).connected).toBe(false)
})

it('keeps cancelled work busy until acknowledgement without replaying input', async () => {
  const { bridge, fake } = await fixture()
  const tab = listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text).tabs[0]!.tab
  const deferred = Promise.withResolvers<unknown>()
  fake.sendCommand.mockReturnValueOnce(deferred.promise)
  const abort = new AbortController()
  const operation = bridge.request('chat-a', { action: 'read', tab }, abort.signal)
  await vi.waitFor(() => { expect(fake.sendCommand).toHaveBeenCalled() })
  abort.abort()
  await expect(operation).rejects.toThrow('may have happened')
  await expect(bridge.request('chat-a', { action: 'read', tab }, signal())).rejects.toThrow('unfinished')
  deferred.resolve({ frameTree: { frame: { id: 'main', url: 'https://fixture.test/' } } })
  await vi.waitFor(async () => { expect((await bridge.request('chat-a', { action: 'read', tab }, signal())).text).toContain('Fixture') })
})

it('automatically reconnects after a Host restart without replaying a browser action', async () => {
  const { bridge, fake, port } = await fixture()
  const tab = listResult((await bridge.request('chat-a', { action: 'list' }, signal())).text).tabs[0]!.tab
  await bridge.request('chat-a', { action: 'read', tab }, signal())
  const calls = fake.sendCommand.mock.calls.length
  await bridge.dispose()
  const replacement = new ChromeBridge({ port, connectWaitMs: 100, timeoutMs: 3000 })
  onTestFinished(async () => { await replacement.dispose() })
  await replacement.start()
  await vi.waitFor(async () => {
    expect(listResult((await replacement.request('chat-a', { action: 'list' }, signal())).text).connected).toBe(true)
  }, { timeout: 4000 })
  expect(fake.sendCommand).toHaveBeenCalledTimes(calls)
  await expect(replacement.request('chat-a', { action: 'read', tab }, signal())).rejects.toThrow('unavailable')
})

it('clears the bridge busy state after a hung screenshot so read can recover on the same handle', async () => {
  const { bridge, fake } = await fixture(true, 8000)
  const tab = listResult((await bridge.request('chat', { action: 'list' }, signal())).text).tabs[0]!.tab
  const original = fake.sendCommand.getMockImplementation()
  fake.sendCommand.mockImplementation(async (target, method, params) => method === 'Page.captureScreenshot'
    ? new Promise(() => {}) : original?.(target, method, params))
  await expect(bridge.request('chat', { action: 'screenshot', tab }, signal())).rejects.toThrow('5 seconds')
  await expect(bridge.request('chat', { action: 'read', tab }, signal())).resolves.toBeDefined()
}, 10000)
