import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { BrowserIpc } from '../src/browser-ipc.ts'

const limits = { timeoutMs: 1000, maxTextChars: 100, maxElements: 10 }
function fixture() {
  const channel = Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn((_message: object, done: (error: Error | null) => void) => { done(null) }),
  })
  const transport = new BrowserIpc(channel as never)
  return { channel, transport }
}
it('matches response ids and removes listeners on disposal', async () => {
  const { channel, transport } = fixture()
  const result = transport.request('s', { action: 'list' }, limits, new AbortController().signal)
  const sent = channel.send.mock.calls[0]![0] as { id: string }
  channel.emit('message', { type: 'w1-browser-result', id: 'unrelated', result: 'wrong' })
  channel.emit('message', { type: 'w1-browser-result', id: sent.id, result: { text: '[]' } })
  expect(await result).toEqual({ text: '[]' })
  transport.dispose()
  expect(channel.listenerCount('message')).toBe(0)
  expect(channel.listenerCount('disconnect')).toBe(0)
})
it('sends cancellation once without retrying an action', async () => {
  const { channel, transport } = fixture()
  const lifetime = new AbortController()
  const result = transport.request('s', { action: 'navigate', tab: 't', url: 'https://example.test/' }, limits, lifetime.signal)
  lifetime.abort()
  await expect(result).rejects.toThrow('may already have been delivered')
  expect(channel.send.mock.calls.map(call => call[0])).toMatchObject([{ type: 'w1-browser-call' }, { type: 'w1-browser-cancel' }])
  transport.dispose()
})
it('rejects outstanding calls on disconnect', async () => {
  const { channel, transport } = fixture()
  const result = transport.request('s', { action: 'list' }, limits, new AbortController().signal)
  channel.emit('disconnect')
  await expect(result).rejects.toThrow('disconnected')
})
