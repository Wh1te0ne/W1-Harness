/** Desktop-side dispatch for the private Host browser channel. */
import type { BrowserLimits, BrowserResult } from '@deepseek-ai/dsh-w1-browser-use/protocol'
import { BrowserControlError } from './browser-automation.ts'

/** The Host cannot select a process, Electron object, or arbitrary protocol method. */
export type BrowserExecutor = (sessionId: string, command: unknown, limits: BrowserLimits, signal: AbortSignal) => Promise<BrowserResult>

/**
 * @param send - reply on the same private child channel.
 * @param execute - owned guest dispatcher.
 * @returns message handler and cancellation disposer.
 */
export function browserHostRequests(send: (value: object) => void, execute: BrowserExecutor | undefined): {
  receive(message: unknown): boolean
  dispose(): void
} {
  const active = new Map<string, AbortController>()
  return {
    receive(message) {
      if (typeof message !== 'object' || message === null || !('type' in message)
        || !['w1-browser-call', 'w1-browser-cancel'].includes(String(message.type))) return false
      if (!('id' in message) || typeof message.id !== 'string' || message.id.length > 128) return true
      const id = message.id
      if (message.type === 'w1-browser-cancel') { active.get(id)?.abort(); return true }
      if (active.has(id)) return true
      const lifetime = new AbortController()
      active.set(id, lifetime)
      void (async () => {
        try {
          if (execute === undefined) throw new BrowserControlError('unavailable', 'The built-in browser is unavailable.')
          if (!('sessionId' in message) || typeof message.sessionId !== 'string' || !('command' in message)
            || !('limits' in message) || typeof message.limits !== 'object' || message.limits === null) throw new BrowserControlError('invalid-request', 'Invalid browser request.')
          const limits = message.limits as Record<string, unknown>
          for (const key of ['timeoutMs', 'maxTextChars', 'maxElements']) {
            if (typeof limits[key] !== 'number' || !Number.isSafeInteger(limits[key]) || limits[key] <= 0) throw new BrowserControlError('invalid-request', 'Invalid browser limits.')
          }
          const bounded: BrowserLimits = { timeoutMs: Math.min(limits.timeoutMs as number, 60000),
            maxTextChars: Math.min(limits.maxTextChars as number, 30000), maxElements: Math.min(limits.maxElements as number, 150) }
          const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(bounded.timeoutMs)])
          const result = await execute(message.sessionId, message.command, bounded, signal)
          send({ type: 'w1-browser-result', id, result })
        } catch (error) {
          send({ type: 'w1-browser-result', id, error: `${error instanceof BrowserControlError ? error.code : 'operation-failed'}: ${error instanceof Error ? error.message : 'Browser operation failed'}` })
        } finally { active.delete(id) }
      })().catch((error: unknown) => { console.error('Browser response delivery failed', error) })
      return true
    },
    dispose() { for (const lifetime of active.values()) lifetime.abort(); active.clear() },
  }
}
