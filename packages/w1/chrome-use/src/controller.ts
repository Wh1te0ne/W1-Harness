/** Tab-scoped executor. Chrome APIs are injected; model data never selects a CDP method or script. */
import { pageOperation, type PageOperation } from '@deepseek-ai/dsh-w1-browser-use/page'
import { browserCommandSchema, type BrowserCommand, type BrowserResult } from '@deepseek-ai/dsh-w1-browser-use/protocol'
import { webOrigin, type SharedTab } from './protocol.ts'
import type { ChromeApi } from './extension-api.ts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { ChromeTabGroups } from './tab-groups.ts'
import { clickReceipt } from './click-receipt.ts'

interface Grant { tab: SharedTab; origin: string; revision: number; active?: AbortController | undefined }
/** Automatically discovers ordinary tabs; each controlled tab is leased to one conversation. */
export class ChromeController {
  private readonly grants = new Map<number, Grant>()
  private readonly attached = new Set<number>()
  private readonly paused = new Set<number>()
  private generation = 0
  private opening = false
  private online = false
  private readonly groups: ChromeTabGroups

  constructor(private readonly api: ChromeApi, private readonly changed: () => void) {
    this.groups = new ChromeTabGroups(api)
    api.tabs.onRemoved.addListener((id) => { this.paused.delete(id); this.revoke(id) })
    api.tabs.onUpdated.addListener((id, info, tab) => {
      const grant = this.grants.get(id)
      if (!grant) { void this.refresh().catch(() => {}); return }
      if (!info.url) return
      grant.revision++
      try {
        if (tab.incognito) { this.revoke(id); return }
        grant.origin = webOrigin(info.url)
        grant.tab = { ...grant.tab, url: info.url, title: (tab.title ?? '').slice(0, 200) }
        this.changed()
      } catch { this.revoke(id) }
    })
    api.debugger.onDetach.addListener((target) => {
      if (target.tabId !== undefined && this.attached.has(target.tabId)) {
        this.attached.delete(target.tabId)
        this.pause(target.tabId, true)
      }
    })
    api.tabs.onCreated.addListener(() => { void this.refresh().catch(() => {}) })
  }

  list(): SharedTab[] { return [...this.grants.values()].map(grant => ({ ...grant.tab })) }

  async start(): Promise<void> { this.online = true; await this.refresh() }

  /** Refresh metadata without attaching a debugger or changing the selected tab. */
  async refresh(): Promise<void> {
    if (!this.online) return
    const generation = this.generation
    const tabs = await this.api.tabs.query({})
    if (generation !== this.generation) return
    const seen = new Set<number>()
    for (const tab of tabs) {
      if (seen.size >= 200) break
      if (tab.id === undefined || tab.incognito || !tab.url) continue
      let origin: string
      try { origin = webOrigin(tab.url) } catch { continue }
      seen.add(tab.id)
      const existing = this.grants.get(tab.id)
      if (existing) {
        if (existing.tab.url !== tab.url) existing.revision++
        existing.origin = origin
        existing.tab.url = tab.url
        existing.tab.title = (tab.title ?? '').slice(0, 200)
      } else this.grants.set(tab.id, { origin, revision: 0,
        tab: { id: tab.id, url: tab.url, title: (tab.title ?? '').slice(0, 200), enabled: !this.paused.has(tab.id) } })
    }
    for (const id of this.grants.keys()) if (!seen.has(id)) this.revoke(id)
    this.changed()
  }

  /** Release this conversation's leases without disconnecting other conversations. */
  release(session: string): void {
    for (const [id, grant] of this.grants) if (grant.tab.owner === session) {
      grant.active?.abort()
      delete grant.tab.owner
      this.detach(id)
    }
    this.changed()
  }

  /** Pause never grants access, and only a popup user action may resume. */
  pause(id: number, paused: boolean): void {
    const grant = this.grants.get(id)
    if (!grant) throw new Error('Tab is not shared')
    if (paused) this.paused.add(id)
    else this.paused.delete(id)
    grant.tab.enabled = !paused
    if (paused) { grant.active?.abort(); this.detach(id) }
    this.changed()
  }

  revoke(id: number): void {
    const grant = this.grants.get(id)
    grant?.active?.abort()
    this.grants.delete(id)
    this.detach(id)
    if (grant) this.changed()
  }

  reset(): void {
    this.online = false
    this.generation++
    for (const id of [...this.grants.keys()]) this.revoke(id)
  }

  private detach(id: number): void {
    if (this.attached.delete(id)) void this.api.debugger.detach({ tabId: id }).catch(() => {})
  }

  /** Execute a validated operation against an approved tab, without OS input or foreground activation. */
  async execute(input: BrowserCommand, signal: AbortSignal, session: string): Promise<BrowserResult> {
    const command = browserCommandSchema.parse(input)
    signal.throwIfAborted()
    if (!this.online) throw new Error('Chrome connection is paused or disconnected')
    if (command.action === 'list') return { text: JSON.stringify(this.list()) }
    if (!session || session.length > 256) throw new Error('Missing conversation owner')
    if (command.action === 'open') return this.open(command.url, signal, session)
    if (!/^\d+$/u.test(command.tab)) throw new Error('Invalid shared Chrome tab')
    const id = Number(command.tab)
    const grant = this.grants.get(id)
    if (!grant) throw new Error('Chrome tab unavailable. List tabs again.')
    if (grant.tab.owner && grant.tab.owner !== session) throw new Error('Chrome tab is controlled by another conversation')
    if (grant.active) throw new Error('Chrome tab is busy')
    const active = new AbortController()
    grant.active = active
    grant.tab.owner = session
    this.changed()
    const combined = AbortSignal.any([signal, active.signal])
    const check = (): void => {
      combined.throwIfAborted()
      if (this.grants.get(id) !== grant || !grant.tab.enabled || grant.tab.owner !== session) throw new Error('Chrome tab released or paused')
    }
    const current = async (): Promise<void> => {
      check()
      const tab = await this.api.tabs.get(id)
      check()
      if (!tab.url || tab.incognito) { this.revoke(id); throw new Error('Chrome tab unavailable') }
      try { webOrigin(tab.url) } catch { this.revoke(id); throw new Error('Only ordinary web pages can be controlled') }
      if (tab.url !== grant.tab.url) { grant.revision++; grant.tab.url = tab.url; grant.origin = webOrigin(tab.url) }
    }
    const send = async (method: string, params?: object): Promise<unknown> => {
      check()
      const result = await this.api.debugger.sendCommand({ tabId: id }, method, params)
      check()
      return result
    }
    const evaluatePage = async (expression: string): Promise<unknown> => {
      const revision = grant.revision
      const tree = await send('Page.getFrameTree') as { frameTree?: { frame?: { id?: string; url?: string } } }
      const frame = tree.frameTree?.frame
      if (!frame?.id || !frame.url || webOrigin(frame.url) !== grant.origin) throw new Error('Main frame is unavailable or changed site')
      const world = await send('Page.createIsolatedWorld', { frameId: frame.id, worldName: 'w1-chrome-control' }) as { executionContextId?: number }
      if (!Number.isInteger(world.executionContextId)) throw new Error('Isolated page context unavailable')
      const value = await send('Runtime.evaluate', { contextId: world.executionContextId,
        expression, returnByValue: true, awaitPromise: false }) as {
        exceptionDetails?: unknown
        result?: { value?: unknown }
      }
      if (value.exceptionDetails) throw new Error('Page operation failed or element became stale. Read again before retrying.')
      if (grant.revision !== revision) throw new Error('Page navigated during operation; read again')
      await current()
      return value.result?.value
    }
    const page = (action: PageOperation['action'], extra: Partial<PageOperation> = {}): Promise<unknown> => {
      const operation: PageOperation = { action, epoch: randomUUID(), maxTextChars: 12000, maxElements: 100, ...extra }
      return evaluatePage(`(${pageOperation.toString()})(${JSON.stringify(operation)})`)
    }
    try {
      await current()
      await this.groups.include(id, combined)
      check()
      if (!this.attached.has(id)) {
        await this.api.debugger.attach({ tabId: id }, '1.3')
        this.attached.add(id)
        try { check() } catch (error) { this.detach(id); throw error }
      }
      switch (command.action) {
        case 'read': return { text: JSON.stringify({ tab: id, page: await page('read') }) }
        case 'fill': await page('fill', { ref: command.ref, text: command.text }); break
        case 'click': {
          const point = await page('point', { ref: command.ref }) as { x?: number; y?: number } | undefined
          if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Element position unavailable')
          await current()
          const receipt = randomUUID()
          await evaluatePage(`(${clickReceipt.toString()})(${JSON.stringify(receipt)},${JSON.stringify(point)})`)
          const params = { x: point.x, y: point.y, button: 'left', clickCount: 1 }
          try { await send('Input.dispatchMouseEvent', { ...params, type: 'mousePressed', buttons: 1 }) }
          finally {
            if (this.attached.has(id)) await this.api.debugger.sendCommand({ tabId: id }, 'Input.dispatchMouseEvent', { ...params, type: 'mouseReleased', buttons: 0 })
          }
          let observed: boolean | null = null
          try {
            const result = await evaluatePage(`(${clickReceipt.toString()})(${JSON.stringify(receipt)})`) as { observed: boolean | null }
            observed = result.observed
          } catch (_error) {
            // Navigation may replace the document after a real click; inspect the new page rather than replaying.
          }
          check()
          return { text: JSON.stringify({ tab: id, inputDispatched: true, clickObserved: observed, outcomeVerified: false,
            message: observed === true ? 'Target received a trusted click. Read to verify the intended outcome.'
              : 'Target click was not confirmed. Read the current page before any further input; do not blindly repeat this click.' }) }
        }
        case 'press': {
          await page('check-key')
          const keys = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32 }
          const text = command.key === 'Enter' ? '\r' : command.key === 'Space' ? ' ' : undefined
          const params = { key: command.key === 'Space' ? ' ' : command.key, code: command.key, windowsVirtualKeyCode: keys[command.key] }
          try { await send('Input.dispatchKeyEvent', { ...params, type: text ? 'keyDown' : 'rawKeyDown', ...text ? { text, unmodifiedText: text } : {} }) }
          finally { if (this.attached.has(id)) await this.api.debugger.sendCommand({ tabId: id }, 'Input.dispatchKeyEvent', { ...params, type: 'keyUp' }) }
          break
        }
        case 'scroll': await page('scroll', { delta: command.pixels * (command.direction === 'up' ? -1 : 1) }); break
        case 'navigate':
          webOrigin(command.url)
          await this.api.tabs.update(id, { url: command.url }); break
        case 'back': {
          const history = await send('Page.getNavigationHistory') as { currentIndex?: number; entries?: { id: number; url: string }[] }
          const previous = history.entries?.[(history.currentIndex ?? 0) - 1]
          if (!previous) throw new Error('No previous history entry')
          webOrigin(previous.url)
          await send('Page.navigateToHistoryEntry', { entryId: previous.id }); break
        }
        case 'screenshot': {
          const capture = async (): Promise<BrowserResult> => {
            const layout = await send('Page.getLayoutMetrics') as {
              cssLayoutViewport?: { pageX: number; pageY: number; clientWidth: number; clientHeight: number }
            }
            const viewport = layout.cssLayoutViewport
            if (!viewport || ![viewport.pageX, viewport.pageY, viewport.clientWidth, viewport.clientHeight].every(Number.isFinite)
              || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) throw new Error('Chrome viewport is not ready. Read the page before taking another screenshot.')
            const width = Math.min(viewport.clientWidth, 4096)
            const height = Math.min(viewport.clientHeight, 4096)
            const image = await send('Page.captureScreenshot', { format: 'jpeg', quality: 75, fromSurface: true,
              captureBeyondViewport: true, optimizeForSpeed: true,
              clip: { x: viewport.pageX, y: viewport.pageY, width, height, scale: Math.min(1, 1600 / Math.max(width, height)) },
            }) as { data?: string }
            await current()
            if (!image.data || image.data.length > 8000000) throw new Error('Screenshot unavailable or exceeds the output limit')
            return { text: JSON.stringify({ tab: id, url: grant.tab.url }), screenshot: image.data }
          }
          let timer: ReturnType<typeof setTimeout> | undefined
          let cancel = (): void => {}
          const stopped = new Promise<never>((_resolve, reject) => {
            cancel = () => { reject(new Error('Screenshot cancelled. No page input was sent.')) }
            combined.addEventListener('abort', cancel, { once: true })
            timer = setTimeout(() => { reject(new Error('Background screenshot unavailable within 5 seconds. Use read; the tab remains usable.')) }, 5000)
          })
          try { return await Promise.race([capture(), stopped]) }
          catch (error) {
            active.abort()
            // Detaching ends the pending capture; a late result cannot affect the next operation.
            if (this.attached.delete(id)) {
              let cleanup: ReturnType<typeof setTimeout> | undefined
              try {
                await Promise.race([this.api.debugger.detach({ tabId: id }), new Promise<never>((_resolve, reject) => {
                  cleanup = setTimeout(() => { reject(new Error('Chrome debugger cleanup timed out')) }, 1000)
                })])
              } catch (_error) {
                this.pause(id, true)
                throw new Error('Screenshot failed and the debugger could not be released. This tab is paused; inspect Chrome before resuming it in the extension.')
              }
              finally { if (cleanup) clearTimeout(cleanup) }
            }
            throw error
          } finally { if (timer) clearTimeout(timer); combined.removeEventListener('abort', cancel) }
        }
      }
      check()
      return { text: JSON.stringify({ tab: id, delivered: true, message: 'Read or screenshot the page to verify the result.' }) }
    } finally { if (grant.active === active) grant.active = undefined }
  }

  private async open(url: string, signal: AbortSignal, session: string): Promise<BrowserResult> {
    if (this.opening) throw new Error('A Chrome tab is already opening')
    const origin = webOrigin(url)
    const generation = this.generation
    this.opening = true
    try {
      const tab = await this.api.tabs.create({ url, active: false })
      if (tab.id === undefined) throw new Error('Chrome did not create a tab')
      // A new tab is an external effect. If authority changes, leave it unshared and report the unknown outcome.
      signal.throwIfAborted()
      if (generation !== this.generation) throw new Error('Chrome connection changed while opening; inspect before retrying')
      this.grants.set(tab.id, { origin, revision: 0, tab: { id: tab.id, url, title: '', enabled: true, owner: session } })
      this.changed()
      await this.groups.include(tab.id, signal)
      return { text: JSON.stringify({ tab: tab.id, message: 'Opened a background Chrome tab in the W1 group. Read it after loading.' }) }
    } finally { this.opening = false }
  }
}
