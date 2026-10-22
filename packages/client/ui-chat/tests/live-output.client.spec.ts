import { describe, expect, it } from 'vitest'
import { liveOutput } from '../src/client/chat/live-output.ts'
import type { AssistantChatData } from '../src/client/contract/chat-nodes.ts'

const assistant = (text: string, usage?: unknown): AssistantChatData => ({
  status: 'running', turn: 1, step: 1, time: 0,
  blocks: [{ kind: 'text', text }], usage,
})

describe('live generated output', () => {
  it('grows with streamed text and reasoning, without counting input as output', () => {
    const first = liveOutput([assistant('hello')])
    const next = liveOutput([{ ...assistant('hello there, more output'), blocks: [
      { kind: 'text', text: 'hello there, more output' },
      { kind: 'reasoning', text: 'additional reasoning' },
    ] }])
    expect(first.estimated).toBe(true)
    expect(next.tokens).toBeGreaterThan(first.tokens)
    expect(liveOutput([{ ...assistant('hello', { inputTokens: 100_000, outputTokens: 3 }), status: 'settled' }]))
      .toEqual({ tokens: 3, estimated: false })
  })

  it('replaces estimates with provider readings without double counting reasoning', () => {
    expect(liveOutput([assistant('many words here', { outputTokens: 9, reasoningTokens: 4 }),
      assistant('next step')])).toEqual({ tokens: 16, estimated: true })
    expect(liveOutput([assistant('many words here', { outputTokens: 9 }),
      { ...assistant('next step', { outputTokens: 2 }), status: 'settled' }])).toEqual({ tokens: 11, estimated: false })
    expect(liveOutput([assistant('text arriving after the initial zero sample', { outputTokens: 0 })]).tokens).toBeGreaterThan(0)
  })

  it('does not animate invented progress while waiting, and rejects invalid usage', () => {
    expect(liveOutput(undefined)).toEqual({ tokens: 0, estimated: false })
    expect(liveOutput([assistant('')])).toEqual({ tokens: 0, estimated: false })
    for (const outputTokens of [-1, Infinity, NaN, 1.2]) {
      expect(liveOutput([assistant('hello', { outputTokens })])).toEqual(liveOutput([assistant('hello')]))
    }
  })
})
