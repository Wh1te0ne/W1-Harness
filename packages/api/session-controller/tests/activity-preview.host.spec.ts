import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Sessions from '@deepseek-ai/dsh-session'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { applySessionListMetadata } from '../src/list.ts'

it('projects bounded assistant text without exposing prompts, reasoning or tool arguments', async () => {
  const ctx = new Context()
  await ctx.plugin(Sessions)
  try {
    const session = ctx.sessions.create()
    const prompt = session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'private prompt' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const start = applySessionListMetadata({ blank: true, lastPromptAt: null }, prompt)
    expect(start.preview).toBeUndefined()
    const message = session.append('assistant/message', { turn: 1, step: 0,
      message: createMessage({ role: 'assistant', content: [{ type: 'text', text: '✅ '.repeat(300) }], source: { kind: 'model', provider: 'test', model: 'test' } }),
      stream: [],
    }, { surfaceOp: 'append' })
    const next = applySessionListMetadata(start, message)
    expect(next.activityAt).toBe(message.time)
    expect(Array.from(next.preview ?? '')).toHaveLength(240)
    expect(next.preview).not.toContain('private prompt')
    expect(next.lastPromptAt).toBe(prompt.time)
  } finally { await ctx.fiber.dispose() }
})
