import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import { SideChatService, sideSystem } from '../src/index.ts'

function setup() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const parent = Session.create(SessionId('main'))
  parent.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Original project question' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  parent.append('model/selection', { provider: 'mock', model: 'main' })
  const requests: GenerateOptions[] = []
  let hold = false
  let fail = false
  ctx.provide('sessions', { messageProjections: [] } as never)
  ctx.provide('sessionController', { inspect: async () => ({ meta: parent.header, inheritedEventCount: parent.inheritedEventCount, events: parent.snapshotEvents() }),
    modelCatalog: async () => ({ default: { provider: 'mock', model: 'fallback' } }) } as never)
  ctx.provide('llm', { prepareCall: async (config: object) => ({ config,
    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      if (fail) throw new Error('Provider unavailable')
      yield { type: 'text-delta', index: 0, text: 'Independent answer' }
      if (hold && !options.signal?.aborted) await new Promise<void>((resolve) => { options.signal?.addEventListener('abort', () => { resolve() }, { once: true }) })
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }) } as never)
  const service = new SideChatService(ctx, { maxChats: 4, maxInputBytes: 100_000, maxOutputTokens: 1000 })
  const open = async (id: string) => {
    const lifetime = new AbortController()
    const lease = service.open(parent.id, id, lifetime.signal)[Symbol.asyncIterator]()
    const receipt = await lease.next()
    if (receipt.done) throw new Error('Side chat closed before its opening receipt')
    onTestFinished(async () => { lifetime.abort(); await lease.return?.() })
    return { lifetime, lease, receipt: receipt.value }
  }
  const send = async (id: string, text: string, context = true, signal = new AbortController().signal) => {
    const result = []
    for await (const frame of service.send(parent.id, id, text, { provider: 'mock', model: 'main' }, context, signal)) result.push(frame)
    return result
  }
  return { service, parent, open, send, requests, hold: () => { hold = true }, fail: (value: boolean) => { fail = value } }
}

describe('temporary side-chat isolation', () => {
  it('freezes opening context, retains multiple turns, logs exact requests and never writes to the main log', async () => {
    const h = setup()
    expect((await h.open('a')).receipt).toEqual({ route: { provider: 'mock', model: 'main' }, contextMessages: 1 })
    h.parent.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Later main message' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const parentBefore = h.parent.snapshotEvents()
    await h.send('a', 'Side one')
    await h.send('a', 'Side two')
    expect(h.parent.snapshotEvents()).toEqual(parentBefore)
    expect(JSON.stringify(h.requests[1]?.messages)).not.toContain('Later main message')
    expect(h.requests[1]?.messages.map(message => message.role)).toEqual(['user', 'user', 'assistant', 'user'])
    expect(h.requests[0]?.system).toBe(sideSystem)
    expect(h.requests[0]?.tools).toBeUndefined()
    expect(h.requests[0]?.sessionId).not.toBe(h.parent.id)
    const chats = Reflect.get(h.service, 'chats') as Map<string, { log: Session }>
    const events = chats.values().next().value!.log.snapshotEvents()
    expect(events.map(event => event.type)).toEqual(['w1/side-request', 'w1/side-response', 'w1/side-request', 'w1/side-response'])
    expect(events[0]?.data).toEqual({ system: sideSystem, messages: h.requests[0]?.messages,
      config: { provider: 'mock', model: 'main', maxTokens: 1000 } })
    expect(events.map(event => ({ type: event.type, data: event.type === 'w1/side-request'
      ? { system: event.data.system, config: event.data.config, roles: event.data.messages.map(message => message.role) }
      : event.data }))).toMatchSnapshot()
  })
  it('omits the main snapshot when requested and keeps two tabs independent', async () => {
    const h = setup()
    await h.open('a'); await h.open('b')
    await h.send('a', 'Private A', false); await h.send('b', 'Private B', false)
    expect(h.requests.map(request => request.messages.length)).toEqual([1, 1])
    expect(JSON.stringify(h.requests[1]?.messages)).not.toContain('Private A')
  })
  it('passes the side model and reasoning effort into the prepared call without changing the parent', async () => {
    const h = setup(); await h.open('a')
    const before = h.parent.snapshotEvents()
    for await (const _frame of h.service.send(h.parent.id, 'a', 'Use max reasoning',
      { provider: 'other', model: 'side-model', reasoningEffort: 'max' }, true, new AbortController().signal)) { /* consume */ }
    expect(h.requests[0]).toMatchObject({ provider: 'other', model: 'side-model', reasoningEffort: 'max', maxTokens: 1000 })
    expect(h.parent.snapshotEvents()).toEqual(before)
  })
  it('stops only one side request, keeps its delivered prefix and allows a follow-up', async () => {
    const h = setup(); await h.open('a'); h.hold()
    const controller = new AbortController()
    const stream = h.service.send(h.parent.id, 'a', 'Stop this', { provider: 'mock', model: 'main' }, false, controller.signal)[Symbol.asyncIterator]()
    expect((await stream.next()).value).toEqual({ kind: 'text', text: 'Independent answer' })
    const before = h.parent.seq
    await expect(h.send('a', 'Duplicate', false)).rejects.toThrow('already running')
    controller.abort()
    await expect(stream.next()).rejects.toThrow()
    expect(h.parent.seq).toBe(before)
    const chats = Reflect.get(h.service, 'chats') as Map<string, { log: Session }>
    expect(chats.values().next().value!.log.snapshotEvents().at(-1)?.data).toMatchObject({ status: 'interrupted', text: 'Independent answer' })
  })
  it('releases an open tab on lease cancellation and does not revive expired history', async () => {
    const h = setup(); const a = await h.open('a'); await h.open('b')
    a.lifetime.abort(); await a.lease.return?.()
    await expect(h.send('a', 'Expired')).rejects.toThrow('expired')
    await expect(h.send('b', 'Still open')).resolves.toHaveLength(2)
  })
  it('records a provider failure without poisoning the next request', async () => {
    const h = setup(); await h.open('a'); h.fail(true)
    await expect(h.send('a', 'Question')).rejects.toThrow('Provider unavailable')
    h.fail(false)
    await expect(h.send('a', 'Try again')).resolves.toHaveLength(2)
    expect(h.parent.seq).toBe(2)
  })
})
