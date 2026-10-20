import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { SideChatModel } from '../src/client/model.ts'
import type { SideFrame, SideRoute } from '@deepseek-ai/dsh-w1-side-chat/types'

function remote() {
  const signals: AbortSignal[] = []
  const calls: { id: string; text: string; context: boolean; route: SideRoute }[] = []
  const close = vi.fn(async () => ({ ok: true, value: undefined }))
  let hold = false
  const api = {
    session: { modelCatalog: vi.fn(async () => ({ ok: true, value: { default: { provider: 'mock', model: 'main' }, groups: [], failures: [], routableProviders: [] } })) },
    w1SideChat: {
      async *open(_parent: string, _id: string, signal: AbortSignal) {
        yield { route: { provider: 'mock', model: 'main' }, contextMessages: 3 }
        if (!signal.aborted) await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      },
      async *send(_parent: string, id: string, text: string, route: SideRoute,
        context: boolean, signal: AbortSignal): AsyncIterable<SideFrame> {
        calls.push({ id, text, context, route }); signals.push(signal)
        yield { kind: 'text', text: `Answer ${id}` }
        if (hold && !signal.aborted) await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
        signal.throwIfAborted()
        yield { kind: 'done', usage: { inputTokens: 10, outputTokens: 4 } }
      }, close,
    },
  }
  return { api, signals, calls, close, hold: () => { hold = true } }
}
describe('side chat tab model', () => {
  it('keeps drafts and model choice independent and appends multiple responses', async () => {
    const r = remote()
    const a = new SideChatModel(r.api as never, SessionId('main'), 'a')
    const b = new SideChatModel(r.api as never, SessionId('main'), 'b')
    await vi.waitFor(() => { expect(a.state.getSnapshot().phase).toBe('idle') })
    a.draft('A draft'); b.draft('B draft')
    a.model({ provider: 'mock', model: 'other', reasoningEffort: 'max' })
    await a.send(); a.draft('A next'); await a.send()
    expect(a.state.getSnapshot()).toMatchObject({ phase: 'idle', error: null })
    expect(a.state.getSnapshot().messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(a.state.getSnapshot().usage).toEqual({ inputTokens: 10, outputTokens: 4 })
    expect(b.state.getSnapshot()).toMatchObject({ draft: 'B draft', route: { model: 'main' }, messages: [] })
    expect(r.calls.map(call => call.context)).toEqual([true, true])
    expect(r.calls.map(call => call.route)).toEqual([
      { provider: 'mock', model: 'other', reasoningEffort: 'max' },
      { provider: 'mock', model: 'other', reasoningEffort: 'max' },
    ])
    await a.dispose(); await b.dispose()
    expect(r.close).toHaveBeenCalledTimes(2)
  })
  it('stops only its own request and rejects a repeated send while running', async () => {
    const r = remote(); r.hold()
    const a = new SideChatModel(r.api as never, SessionId('main'), 'a')
    const b = new SideChatModel(r.api as never, SessionId('main'), 'b')
    await vi.waitFor(() => { expect(b.state.getSnapshot().phase).toBe('idle') })
    a.draft('A'); b.draft('B')
    const first = a.send(); const second = b.send()
    await vi.waitFor(() => { expect(r.signals).toHaveLength(2) })
    a.draft('next'); await a.send(); expect(r.calls).toHaveLength(2)
    a.stop(); await first
    expect(r.signals[0]?.aborted).toBe(true)
    expect(r.signals[1]?.aborted).toBe(false)
    expect(a.state.getSnapshot()).toMatchObject({ phase: 'stopped', draft: 'next' })
    await b.dispose(); await second; await a.dispose()
  })
  it('keeps the opening route usable when model discovery fails, and supports retry', async () => {
    const r = remote()
    r.api.session.modelCatalog.mockRejectedValueOnce(new Error('catalog unavailable'))
    const a = new SideChatModel(r.api as never, SessionId('main'), 'a')
    await vi.waitFor(() => { expect(a.state.getSnapshot().catalogError).toBe('catalog unavailable') })
    expect(a.state.getSnapshot()).toMatchObject({ phase: 'idle', route: { model: 'main' }, error: null })
    a.draft('uses the opening route'); await a.send()
    expect(r.calls).toHaveLength(1)
    await a.loadCatalog()
    expect(a.state.getSnapshot().catalogError).toBeNull()
    await a.dispose()
  })
  it('allows empty close and retains populated history until one confirmed retry', async () => {
    const r = remote()
    const a = new SideChatModel(r.api as never, SessionId('main'), 'a')
    await vi.waitFor(() => { expect(a.state.getSnapshot().phase).toBe('idle') })
    const retry = vi.fn(() => { expect(a.requestClose(() => {})).toBe(true) })
    expect(a.requestClose(retry)).toBe(true)
    a.draft('keep this history'); await a.send()
    expect(a.requestClose(retry)).toBe(false)
    expect(a.state.getSnapshot().closeRequested).toBe(true)
    a.cancelClose()
    expect(a.state.getSnapshot().messages).toHaveLength(2)
    a.confirmClose()
    expect(retry).not.toHaveBeenCalled()
    expect(a.requestClose(retry)).toBe(false)
    a.confirmClose(); a.confirmClose()
    expect(retry).toHaveBeenCalledOnce()
    expect(a.requestClose(retry)).toBe(false)
    a.cancelClose()
    await a.dispose()
  })
})
