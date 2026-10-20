import { expect, it, vi } from 'vitest'
import { browserHostRequests } from '../src/browser-host-requests.ts'

it('dispatches only private browser messages and validates limits before calling the executor', async () => {
  const send = vi.fn()
  const execute = vi.fn(async () => ({ text: '[]' }))
  const host = browserHostRequests(send, execute)
  expect(host.receive({ type: 'ready' })).toBe(false)
  expect(host.receive({ type: 'w1-browser-call', id: 'bad', sessionId: 's', command: { action: 'list' }, limits: {} })).toBe(true)
  await vi.waitFor(() => { expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 'bad', error: expect.stringContaining('invalid-request') })) })
  expect(execute).not.toHaveBeenCalled()
  host.receive({ type: 'w1-browser-call', id: 'good', sessionId: 's', command: { action: 'list' },
    limits: { timeoutMs: 1000, maxTextChars: 1000000, maxElements: 1000 } })
  await vi.waitFor(() => { expect(send).toHaveBeenCalledWith({ type: 'w1-browser-result', id: 'good', result: { text: '[]' } }) })
  expect(execute).toHaveBeenCalledWith('s', { action: 'list' }, { timeoutMs: 1000, maxTextChars: 30000, maxElements: 150 }, expect.any(AbortSignal))
  host.dispose()
})

it('forwards cancellation and disconnect without retrying input', async () => {
  const send = vi.fn()
  const signals: AbortSignal[] = []
  const host = browserHostRequests(send, async (_session, _command, _limits, signal) => {
    signals.push(signal)
    return new Promise((_resolve, reject) => { signal.addEventListener('abort', () => { reject(new Error('cancelled')) }, { once: true }) })
  })
  const call = (id: string) => ({ type: 'w1-browser-call', id, sessionId: 's', command: { action: 'read', tab: 't' },
    limits: { timeoutMs: 1000, maxTextChars: 100, maxElements: 10 } })
  host.receive(call('first'))
  host.receive({ type: 'w1-browser-cancel', id: 'first' })
  expect(signals[0]?.aborted).toBe(true)
  host.receive(call('second'))
  host.dispose()
  expect(signals[1]?.aborted).toBe(true)
  await vi.waitFor(() => { expect(send).toHaveBeenCalledTimes(2) })
})
