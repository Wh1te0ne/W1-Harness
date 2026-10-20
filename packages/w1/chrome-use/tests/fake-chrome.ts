/** Synthetic Chrome API with a real isolated DOM; never contacts a browser. */
import { JSDOM } from 'jsdom'
import { vi } from 'vitest'
import type { ChromeApi, ChromeTab } from '../src/extension-api.ts'

export function fakeChrome() {
  const dom = new JSDOM('<title>Fixture</title><label for="name">Name</label><input id="name"><button>Save</button><input type="password" value="private">', {
    url: 'https://fixture.test/', runScripts: 'outside-only',
  })
  const window = dom.window
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get(this: HTMLElement) { return this.textContent } })
  window.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 30,
    width: 100, height: 30, toJSON: () => ({}) })
  window.Element.prototype.scrollIntoView = () => {}
  window.document.elementFromPoint = () => window.document.querySelector('input')
  window.scrollBy = () => {}
  const tabs = new Map<number, ChromeTab>([[1, { id: 1, windowId: 1, url: 'https://fixture.test/', title: 'Fixture' }],
    [2, { id: 2, windowId: 1, url: 'https://private.test/', title: 'Unshared' }]])
  const groups = new Map<number, { id: number; windowId: number; title?: string }>()
  const listeners = {
    updated: (_id: number, _info: { url?: string }, _tab: ChromeTab) => {}, removed: (_id: number) => {},
    detached: (_target: { tabId?: number }, _reason: string) => {},
    created: (_tab: ChromeTab) => {},
  }
  const sendCommand = vi.fn(async (_target: { tabId: number }, method: string, params?: object): Promise<unknown> => {
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main', url: tabs.get(_target.tabId)?.url } } }
    if (method === 'Page.createIsolatedWorld') return { executionContextId: 1 }
    if (method === 'Runtime.evaluate') {
      try { return { result: { value: window.eval((params as { expression: string }).expression) } } }
      catch { return { exceptionDetails: { text: 'synthetic page refusal' } } }
    }
    if (method === 'Page.captureScreenshot') return { data: 'c3ludGhldGlj' }
    if (method === 'Page.getLayoutMetrics') return { cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 1024, clientHeight: 768 } }
    if (method === 'Page.getNavigationHistory') return { currentIndex: 1, entries: [{ id: 0, url: 'https://elsewhere.test/' }] }
    return {}
  })
  const settings: Record<string, unknown> = {}
  const api: ChromeApi = {
    tabs: {
      get: vi.fn(async (id: number) => { const tab = tabs.get(id); if (!tab) throw new Error('closed'); return { ...tab } }),
      query: vi.fn(async (options: { active?: boolean }) => options.active ? [{ ...tabs.get(1)! }] : [...tabs.values()]),
      create: vi.fn(async (options: { url: string }) => {
        const tab = { id: tabs.size + 1, windowId: 1, url: options.url }; tabs.set(tab.id, tab); return tab
      }),
      update: vi.fn(async (id: number, options: { url: string }) => {
        const tab = { ...tabs.get(id), url: options.url }; tabs.set(id, tab); return tab
      }),
      remove: vi.fn(async (id: number) => { tabs.delete(id) }), goBack: vi.fn(async () => {}),
      group: vi.fn(async (options: Parameters<ChromeApi['tabs']['group']>[0]) => {
        const id = options.groupId ?? groups.size + 1
        if (options.groupId === undefined) groups.set(id, { id, windowId: options.createProperties?.windowId ?? 1 })
        for (const tabId of options.tabIds) {
          const tab = tabs.get(tabId)
          if (tab) tab.groupId = id
        }
        return id
      }),
      onUpdated: { addListener: (listener) => { listeners.updated = listener } },
      onRemoved: { addListener: (listener) => { listeners.removed = listener } },
      onCreated: { addListener: (listener) => { listeners.created = listener } },
    },
    tabGroups: {
      query: vi.fn(async (options: { title: string; windowId: number }) =>
        [...groups.values()].filter(group => group.title === options.title && group.windowId === options.windowId)),
      update: vi.fn(async (id: number, options: object) => { Object.assign(groups.get(id) ?? {}, options); return {} }),
    },
    debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand,
      onDetach: { addListener: (listener) => { listeners.detached = listener } } },
    runtime: { id: 'fixture', getURL: path => `chrome-extension://fixture/${path}`, onMessage: { addListener: () => {} },
      onStartup: { addListener: () => {} }, onInstalled: { addListener: () => {} } },
    storage: { local: { get: async () => ({ ...settings }), set: async (value) => { Object.assign(settings, value) } } },
    alarms: { create: async () => {}, onAlarm: { addListener: () => {} } },
  }
  return { api, tabs, groups, listeners, sendCommand, dom, settings }
}
