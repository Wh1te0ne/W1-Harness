/** Correlated Host-to-desktop browser requests over the private child-process channel. */
import { randomUUID } from 'node:crypto'
import type { BrowserCommand, BrowserLimits } from '@deepseek-ai/dsh-w1-browser-use/protocol'

interface Pending { readonly resolve: (value: unknown) => void; readonly reject: (error: Error) => void }
/** Owns response listeners and never retries an action after an unknown result. */
export class BrowserIpc {
  private readonly pending = new Map<string, Pending>()
  private disposed = false
  /** @param channel - owned Node IPC process, replaceable in transport tests. */
  constructor(private readonly channel: Pick<NodeJS.Process, 'on' | 'removeListener' | 'send' | 'connected'> = process) {
    channel.on('message', this.receive)
    channel.on('disconnect', this.dispose)
  }
  private readonly receive = (message: unknown): void => {
    if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'w1-browser-result'
      || !('id' in message) || typeof message.id !== 'string') return
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    if ('error' in message && typeof message.error === 'string') pending.reject(new Error(message.error))
    else if ('result' in message) pending.resolve(message.result)
    else pending.reject(new Error('Invalid browser response. Inspect the page before retrying.'))
  }
  /**
   * @param sessionId - actual executing Agent's session.
   * @param command - validated tool arguments.
   * @param limits - observation/deadline policy.
   * @param signal - tool cancellation.
   * @returns desktop observation.
   */
  readonly request = async (sessionId: string, command: BrowserCommand, limits: BrowserLimits, signal: AbortSignal): Promise<unknown> => {
    signal.throwIfAborted()
    if (this.disposed || !this.channel.connected || this.channel.send === undefined) throw new Error('Built-in browser is unavailable outside the desktop application.')
    const id = randomUUID()
    const combined = AbortSignal.any([signal, AbortSignal.timeout(limits.timeoutMs)])
    const send = this.channel.send.bind(this.channel)
    let abort: (() => void) | undefined
    try {
      return await new Promise<unknown>((resolve, reject) => {
        this.pending.set(id, { resolve, reject })
        abort = () => {
          if (this.channel.connected) send({ type: 'w1-browser-cancel', id }, () => {})
          reject(new Error('Browser operation cancelled or timed out; input may already have been delivered. Read the page before retrying.'))
        }
        combined.addEventListener('abort', abort, { once: true })
        send({ type: 'w1-browser-call', id, sessionId, command,
          limits: { timeoutMs: limits.timeoutMs, maxTextChars: limits.maxTextChars, maxElements: limits.maxElements },
        }, (error) => { if (error !== null) reject(error) })
        if (combined.aborted) abort()
      })
    } finally {
      if (abort !== undefined) combined.removeEventListener('abort', abort)
      this.pending.delete(id)
    }
  }
  /** End every outstanding call and remove owned process listeners. */
  readonly dispose = (): void => {
    this.disposed = true
    this.channel.removeListener('message', this.receive)
    this.channel.removeListener('disconnect', this.dispose)
    for (const [id, { reject }] of this.pending) {
      if (this.channel.connected) this.channel.send?.({ type: 'w1-browser-cancel', id }, () => {})
      reject(new Error('Browser controller disconnected. Inspect the page before retrying.'))
    }
    this.pending.clear()
  }
}
