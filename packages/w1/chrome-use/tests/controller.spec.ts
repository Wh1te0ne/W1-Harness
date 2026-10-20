import { expect, it, onTestFinished, vi } from 'vitest'
import { ChromeController } from '../src/controller.ts'
import { fakeChrome } from './fake-chrome.ts'
import { pageResult } from './observations.ts'

async function fixture() {
  const fake = fakeChrome()
  const controller = new ChromeController(fake.api, vi.fn())
  onTestFinished(() => { controller.reset(); fake.dom.window.close() })
  await controller.start()
  return { ...fake, controller, signal: new AbortController().signal }
}

it('discovers tabs automatically and verifies literal input using fresh refs', async () => {
  const { controller, signal, dom, api } = await fixture()
  expect(controller.list()).toHaveLength(2)
  expect(api.debugger.attach).not.toHaveBeenCalled()
  const before = pageResult((await controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).text)
  const ref = before.page.elements[0]!.ref
  await controller.execute({ action: 'fill', tab: '1', ref, text: 'W1' }, signal, 'chat-a')
  expect(dom.window.document.querySelector('input')?.value).toBe('W1')
  await expect(controller.execute({ action: 'fill', tab: '1', ref, text: 'again' }, signal, 'chat-a')).rejects.toThrow('stale')
  const after = pageResult((await controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).text)
  expect(after.page.elements[0]!.value).toBe('W1')
  expect(api.debugger.attach).toHaveBeenCalledTimes(1)
  await expect(controller.execute({ action: 'read', tab: '1' }, signal, 'chat-b')).rejects.toThrow('another conversation')
  controller.release('chat-a')
  await expect(controller.execute({ action: 'read', tab: '1' }, signal, 'chat-b')).resolves.toBeDefined()
})

it('rejects passwords and internal pages but permits ordinary navigation and background tabs', async () => {
  const { controller, signal, api } = await fixture()
  const read = pageResult((await controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).text)
  await expect(controller.execute({ action: 'fill', tab: '1', ref: read.page.elements[2]!.ref, text: 'secret' }, signal, 'chat-a')).rejects.toThrow('Page operation failed')
  await expect(controller.execute({ action: 'navigate', tab: '1', url: 'chrome://settings/' }, signal, 'chat-a')).rejects.toThrow('HTTP/HTTPS')
  await controller.execute({ action: 'navigate', tab: '1', url: 'https://other.test/' }, signal, 'chat-a')
  expect(api.tabs.update).toHaveBeenCalledWith(1, { url: 'https://other.test/' })
  await controller.execute({ action: 'open', url: 'https://new.test/' }, signal, 'chat-a')
  expect(api.tabs.create).toHaveBeenCalledWith({ url: 'https://new.test/', active: false })
})

it('keeps normal cross-site tabs discoverable and excludes incognito and browser pages', async () => {
  const { controller, listeners, tabs } = await fixture()
  tabs.set(1, { id: 1, url: 'https://other.test/' })
  listeners.updated(1, { url: 'https://other.test/' }, tabs.get(1)!)
  expect(controller.list().find(tab => tab.id === 1)?.url).toBe('https://other.test/')
  tabs.set(1, { id: 1, url: 'chrome://settings/' })
  tabs.set(3, { id: 3, url: 'https://hidden.test/', incognito: true })
  await controller.refresh()
  expect(controller.list().map(tab => tab.id)).toEqual([2])
})

it('honors pauses and treats a user-detached debugger as a pause rather than auto-reattaching', async () => {
  const { controller, signal, api, listeners } = await fixture()
  await controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')
  controller.pause(1, true)
  await controller.refresh()
  expect(api.debugger.detach).toHaveBeenCalledWith({ tabId: 1 })
  await expect(controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).rejects.toThrow('paused')
  controller.pause(1, false)
  await controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')
  listeners.detached({ tabId: 1 }, 'canceled_by_user')
  expect(controller.list().find(tab => tab.id === 1)?.enabled).toBe(false)
  controller.reset()
  await controller.refresh()
  expect(controller.list()).toEqual([])
  await controller.start()
  expect(controller.list().find(tab => tab.id === 1)?.enabled).toBe(false)
})

it('stops after cancellation during observation and keeps overlapping operations out', async () => {
  const { controller, api, signal } = await fixture()
  const deferred = Promise.withResolvers<unknown>()
  vi.mocked(api.debugger.sendCommand).mockReturnValueOnce(deferred.promise)
  const abort = new AbortController()
  const operation = controller.execute({ action: 'read', tab: '1' }, abort.signal, 'chat-a')
  await vi.waitFor(() => { expect(api.debugger.sendCommand).toHaveBeenCalled() })
  await expect(controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).rejects.toThrow('busy')
  abort.abort()
  deferred.resolve({ frameTree: { frame: { id: 'main', url: 'https://fixture.test/' } } })
  await expect(operation).rejects.toThrow()
  expect(api.debugger.sendCommand).toHaveBeenCalledTimes(1)
})

it('does not detach a debugger it could not acquire', async () => {
  const { controller, api, signal } = await fixture()
  vi.mocked(api.debugger.attach).mockRejectedValueOnce(new Error('Another debugger is attached'))
  await expect(controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).rejects.toThrow('Another debugger')
  expect(api.debugger.detach).not.toHaveBeenCalled()
})

it('groups only used pages, reuses the window group and preserves it after release/reconnect', async () => {
  const { controller, api, signal, tabs, groups } = await fixture()
  expect(api.tabs.group).not.toHaveBeenCalled()
  await controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')
  expect(groups.size).toBe(1)
  expect(tabs.get(1)?.groupId).toBe(1)
  expect(tabs.get(2)?.groupId).toBeUndefined()
  controller.release('chat-a')
  controller.reset()
  await controller.start()
  await controller.execute({ action: 'read', tab: '2' }, signal, 'chat-b')
  expect(groups.size).toBe(1)
  expect(tabs.get(2)?.groupId).toBe(1)
  expect(api.tabs.update).not.toHaveBeenCalled()
})

it('does not silently unpin a page to group it', async () => {
  const { controller, api, signal, tabs } = await fixture()
  const tab = tabs.get(1)
  if (!tab) throw new Error('Missing fixture')
  tab.pinned = true
  await expect(controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).rejects.toThrow('Pinned')
  expect(api.tabs.group).not.toHaveBeenCalled()
  expect(api.debugger.attach).not.toHaveBeenCalled()
})

it('does not report an unobserved click as successful just because CDP accepted the input', async () => {
  const { controller, signal } = await fixture()
  const before = pageResult((await controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).text)
  const result = await controller.execute({ action: 'click', tab: '1', ref: before.page.elements[0]!.ref }, signal, 'chat-a')
  expect(JSON.parse(result.text)).toMatchObject({ inputDispatched: true, clickObserved: false, outcomeVerified: false })
  expect(JSON.parse(result.text)).not.toHaveProperty('delivered', true)
})

it('uses an explicit rendered viewport for background screenshots without activating a page', async () => {
  const { controller, api, signal } = await fixture()
  const result = await controller.execute({ action: 'screenshot', tab: '1' }, signal, 'chat-a')
  expect(result.screenshot).toBeDefined()
  expect(api.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 1 }, 'Page.captureScreenshot', expect.objectContaining({
    fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1024, height: 768, scale: 1 },
  }))
  expect(api.tabs.update).not.toHaveBeenCalled()
})

it('detaches a hanging capture on timeout and allows a fresh read immediately', async () => {
  const { controller, api, signal, sendCommand } = await fixture()
  const original = sendCommand.getMockImplementation()
  sendCommand.mockImplementation(async (target, method, params) => method === 'Page.captureScreenshot'
    ? new Promise(() => {}) : original?.(target, method, params))
  const operation = controller.execute({ action: 'screenshot', tab: '1' }, signal, 'chat-a')
  await expect(operation).rejects.toThrow('5 seconds')
  expect(api.debugger.detach).toHaveBeenCalledWith({ tabId: 1 })
  await expect(controller.execute({ action: 'read', tab: '1' }, signal, 'chat-a')).resolves.toBeDefined()
}, 8000)
