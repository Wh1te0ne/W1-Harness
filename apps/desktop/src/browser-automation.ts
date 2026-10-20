/** Execute bounded operations only on a conversation-owned webContents. */
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { browserCommandSchema, type BrowserLimits, type BrowserResult } from '@deepseek-ai/dsh-w1-browser-use/protocol'
import type { DesktopBrowserLeaseId, DesktopBrowserBinding } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { pageOperation, type PageOperation } from './browser-page-script.ts'
import { browserFocusOperation } from './browser-focus.ts'

interface Target {
  readonly id: DesktopBrowserLeaseId
  readonly binding: DesktopBrowserBinding
  readonly guest: WebContents
  readonly owner: WebContents
  enabled: boolean
  revision: number
  active?: AbortController | undefined
}
interface Opening { readonly sessionId: string; readonly resolve: (target: Target) => void }
/** Declared browser refusal; delivery may already have occurred when cancellation wins. */
export class BrowserControlError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'BrowserControlError' }
}

/** Owns automation targets independently of the user's desktop and cursor. */
export class BrowserAutomation {
  private readonly targets = new Map<DesktopBrowserLeaseId, Target>()
  private readonly openings = new Map<string, Opening>()

  /** @param allowedUrl - existing guest navigation policy. @param open - request a visible tab from the trusted renderer. */
  constructor(private readonly allowedUrl: (url: string) => boolean,
    private readonly open: (sessionId: string, requestId: string, url: string) => void) {}

  /**
   * Attach a ready guest to its exact conversation.
   * @param id - main-issued lease.
   * @param binding - product-issued conversation.
   * @param guest - approved guest.
   * @param owner - product document whose editor focus is preserved during input.
   * @returns teardown callback.
   */
  attach(id: DesktopBrowserLeaseId, binding: DesktopBrowserBinding, guest: WebContents, owner: WebContents): () => void {
    const target: Target = { id, binding, guest, owner, enabled: binding.automationEnabled ?? true, revision: 0 }
    this.targets.set(id, target)
    const ready = (): void => {
      if (!this.allowedUrl(guest.getURL())) return
      const opening = binding.requestId === undefined ? undefined : this.openings.get(binding.requestId)
      if (opening?.sessionId === binding.sessionId) opening.resolve(target)
    }
    guest.on('did-finish-load', ready)
    const navigating = (): void => { target.revision++ }
    guest.on('did-start-navigation', navigating)
    return () => {
      guest.removeListener('did-finish-load', ready)
      guest.removeListener('did-start-navigation', navigating)
      target.active?.abort(new BrowserControlError('tab-closed', 'The browser tab closed. List tabs again.'))
      this.targets.delete(id)
    }
  }

  /** Pause immediately; resuming is a user operation, never a model tool. @param id - owned tab. @param enabled - user's choice. */
  setEnabled(id: DesktopBrowserLeaseId, enabled: boolean): void {
    const target = this.targets.get(id)
    if (target === undefined) throw new BrowserControlError('tab-unavailable', 'The browser tab is not ready.')
    target.enabled = enabled
    if (!enabled) target.active?.abort(new BrowserControlError('paused', 'The user paused browser control. Wait for the user to resume.'))
  }

  /** Cancel all pending work when the owning Host disconnects. */
  cancel(): void {
    for (const target of this.targets.values()) target.active?.abort(new BrowserControlError('disconnected', 'Browser controller disconnected. Inspect before retrying.'))
  }

  /**
   * Validate every command and enforce conversation ownership at execution.
   * @param sessionId - caller's conversation.
   * @param input - untrusted command.
   * @param limits - bounded observation settings.
   * @param signal - call lifetime.
   * @returns observed text or a screenshot.
   */
  async execute(sessionId: string, input: unknown, limits: BrowserLimits, signal: AbortSignal): Promise<BrowserResult> {
    const command = browserCommandSchema.parse(input)
    signal.throwIfAborted()
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 256) throw new BrowserControlError('invalid-session', 'Invalid browser conversation.')
    if (command.action === 'list') {
      const targets = [...this.targets.values()].filter(target => target.binding.sessionId === sessionId && !target.guest.isDestroyed())
      return { text: JSON.stringify(targets.slice(0, 50).map(target => ({
        tab: target.id, url: target.guest.getURL().slice(0, 1000),
        title: target.guest.getTitle().slice(0, 200), enabled: target.enabled,
      }))) }
    }
    if (command.action === 'open') {
      this.checkUrl(command.url)
      const requestId = randomUUID()
      try {
        const target = await abortable(new Promise<Target>((resolve) => {
          this.openings.set(requestId, { sessionId, resolve })
          this.open(sessionId, requestId, command.url)
        }), signal)
        return { text: JSON.stringify({ tab: target.id, url: target.guest.getURL(), message: 'Tab opened. Read the page before acting.' }) }
      } finally { this.openings.delete(requestId) }
    }
    const target = this.targets.get(command.tab as DesktopBrowserLeaseId)
    if (target === undefined || target.binding.sessionId !== sessionId || target.guest.isDestroyed()) throw new BrowserControlError('tab-unavailable', 'Tab unavailable in this conversation. Use list/open.')
    if (!target.enabled) throw new BrowserControlError('paused', 'The user paused browser control. Wait for the user to resume.')
    if (target.active !== undefined) throw new BrowserControlError('busy', 'This tab already has an operation in progress. Wait and read again.')
    const active = new AbortController()
    target.active = active
    const combined = AbortSignal.any([signal, active.signal])
    const guest = target.guest
    const run = async (): Promise<BrowserResult> => {
      combined.throwIfAborted()
      this.checkUrl(guest.getURL())
      const page = async (action: PageOperation['action'], extra: Partial<PageOperation> = {}): Promise<unknown> => {
        combined.throwIfAborted()
        const input: PageOperation = { action, epoch: randomUUID(),
          maxTextChars: Math.min(limits.maxTextChars, 30000), maxElements: Math.min(limits.maxElements, 150), ...extra }
        const revision = target.revision
        const result: unknown = await guest.executeJavaScriptInIsolatedWorld(1004, [{ code: `(${pageOperation.toString()})(${JSON.stringify(input)})` }])
        combined.throwIfAborted()
        if (target.revision !== revision) throw new BrowserControlError('page-changed', 'The page navigated during observation. Read the page again.')
        return result
      }
      const withInput = async (send: () => Promise<void>): Promise<void> => {
        combined.throwIfAborted()
        if (guest.debugger.isAttached()) throw new BrowserControlError('debugger-busy', 'The tab debugger is already in use. Close its DevTools before retrying.')
        guest.debugger.attach('1.3')
        try { await send() }
        finally { if (!guest.isDestroyed() && guest.debugger.isAttached()) guest.debugger.detach() }
      }
      switch (command.action) {
        case 'navigate': this.checkUrl(command.url); await guest.loadURL(command.url); break
        case 'back':
          if (!guest.navigationHistory.canGoBack()) throw new BrowserControlError('no-history', 'No previous page.')
          guest.navigationHistory.goBack(); break
        case 'read': return { text: JSON.stringify({ tab: target.id, page: await page('read') }) }
        case 'click': {
          const point = await page('point', { ref: command.ref })
          if (typeof point !== 'object' || point === null || !('x' in point) || !('y' in point)
            || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new BrowserControlError('invalid-page', 'Could not locate the element. Read the page again.')
          combined.throwIfAborted()
          await withInput(async () => {
            const params = { x: point.x, y: point.y, button: 'left', clickCount: 1 }
            try { await guest.debugger.sendCommand('Input.dispatchMouseEvent', { ...params, type: 'mousePressed', buttons: 1 }) }
            finally {
              // Releasing the button is cleanup, including when cancellation follows a delivered press.
              if (!guest.isDestroyed()) await guest.debugger.sendCommand('Input.dispatchMouseEvent', {
                ...params, type: 'mouseReleased', buttons: 0,
              })
            }
          })
          break
        }
        case 'fill': await page('fill', { ref: command.ref, text: command.text }); break
        case 'press':
          await page('check-key')
          await withInput(async () => {
            const keys = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8,
              ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32 }
            const params = { key: command.key === 'Space' ? ' ' : command.key,
              code: command.key, windowsVirtualKeyCode: keys[command.key] }
            const text = command.key === 'Enter' ? '\r' : command.key === 'Space' ? ' ' : undefined
            try { await guest.debugger.sendCommand('Input.dispatchKeyEvent', { ...params,
              type: text === undefined ? 'rawKeyDown' : 'keyDown', ...text === undefined ? {} : { text, unmodifiedText: text } }) }
            finally { if (!guest.isDestroyed()) await guest.debugger.sendCommand('Input.dispatchKeyEvent', { ...params, type: 'keyUp' }) }
          }); break
        case 'scroll': await page('scroll', { delta: command.pixels * (command.direction === 'up' ? -1 : 1) }); break
        case 'screenshot': {
          const image = await guest.capturePage()
          combined.throwIfAborted()
          if (image.isEmpty()) throw new BrowserControlError('empty-screenshot', 'Page is not rendered. Read the page or retry after loading.')
          const size = image.getSize()
          const scaled = size.width > 1600 ? image.resize({ width: 1600 }) : image
          return { text: JSON.stringify({ tab: target.id, url: guest.getURL(), width: scaled.getSize().width, height: scaled.getSize().height }), screenshot: scaled.toJPEG(75).toString('base64') }
        }
      }
      combined.throwIfAborted()
      return { text: JSON.stringify({ tab: target.id, delivered: true, url: guest.getURL(), message: 'Input delivered; use read or screenshot to verify the result.' }) }
    }
    // Keep the tab busy until the underlying operation settles, even after cancellation.
    const operation = (async () => {
      if (command.action === 'read' || command.action === 'screenshot') return run()
      const token = randomUUID()
      const focus = (begin: boolean) => target.owner.executeJavaScriptInIsolatedWorld(1005,
        [{ code: `(${browserFocusOperation.toString()})(${JSON.stringify(token)},${begin})` }])
      await focus(true)
      try { return await run() }
      finally { if (!target.owner.isDestroyed()) await focus(false) }
    })().finally(() => { if (target.active === active) target.active = undefined })
    return abortable(operation, combined)
  }

  private checkUrl(url: string): void {
    if (!this.allowedUrl(url)) throw new BrowserControlError('blocked-url', 'Only permitted HTTP/HTTPS pages can be controlled. The application itself is excluded.')
  }
}

/**
 * Reject promptly without implying the underlying input was rolled back.
 * @param promise - owned work.
 * @param signal - cancellation.
 * @returns operation result.
 */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      const reason: unknown = signal.reason
      reject(reason instanceof Error ? reason : new BrowserControlError('cancelled', 'Browser operation cancelled. Inspect before retrying.'))
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    promise.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort) }).catch(() => {})
  })
}
