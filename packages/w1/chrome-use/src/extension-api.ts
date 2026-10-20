/** The Chrome API subset used by the extension and its synthetic test adapter. */
export interface ChromeTab {
  id?: number
  url?: string
  title?: string
  incognito?: boolean
  windowId?: number
  groupId?: number
  pinned?: boolean
}
interface ChromeEvent<T> { addListener(listener: T): void }
export interface ChromeApi {
  tabs: {
    get: (id: number) => Promise<ChromeTab>
    query: (options: { active?: boolean; currentWindow?: boolean }) => Promise<ChromeTab[]>
    create: (options: { url: string; active: boolean }) => Promise<ChromeTab>
    update: (id: number, options: { url: string }) => Promise<ChromeTab>
    remove: (id: number) => Promise<void>
    goBack: (id: number) => Promise<void>
    group: (options: { tabIds: number[]; groupId?: number; createProperties?: { windowId: number } }) => Promise<number>
    onUpdated: ChromeEvent<(id: number, info: { url?: string }, tab: ChromeTab) => void>
    onRemoved: ChromeEvent<(id: number) => void>
    onCreated: ChromeEvent<(tab: ChromeTab) => void>
  }
  tabGroups: {
    query: (options: { title: string; windowId: number }) => Promise<{ id: number; title?: string; windowId: number }[]>
    update: (id: number, options: { title?: string; color?: 'blue'; collapsed?: boolean }) => Promise<unknown>
  }
  debugger: {
    attach: (target: { tabId: number }, version: string) => Promise<void>
    detach: (target: { tabId: number }) => Promise<void>
    sendCommand: (target: { tabId: number }, method: string, params?: object) => Promise<unknown>
    onDetach: ChromeEvent<(target: { tabId?: number }, reason: string) => void>
  }
  runtime: {
    id: string
    getURL(path: string): string
    onStartup: ChromeEvent<() => void>
    onInstalled: ChromeEvent<() => void>
    onMessage: ChromeEvent<(message: unknown, sender: { id?: string; url?: string; tab?: ChromeTab },
      reply: (value: unknown) => void) => boolean>
  }
  storage: { local: { get: (keys: string[]) => Promise<Record<string, unknown>>; set: (value: object) => Promise<void> } }
  alarms: { create: (name: string, options: { periodInMinutes: number }) => Promise<void>
    onAlarm: ChromeEvent<(alarm: { name: string }) => void> }
}
