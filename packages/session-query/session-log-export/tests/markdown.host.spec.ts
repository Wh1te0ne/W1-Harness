import { expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { sessionMarkdown } from '../src/markdown.ts'

it('copies full direct conversation text and code, excluding injected context and reasoning', () => {
  const session = Session.create(SessionId('copy-fixture'))
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '原始问题' }] }), { surfaceOp: 'append' })
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({
    source: { kind: 'model', provider: 'fixture', model: 'local' },
    content: [{ type: 'reasoning', text: 'PRIVATE_THINKING' }, { type: 'text', text: '答案\n```ts\nconst x = 1\n```' }],
  }) }, { surfaceOp: 'append' })
  const markdown = sessionMarkdown({ session: session.header, events: session.snapshotEvents(), inheritedEventCount: 0 as never })
  expect(markdown).toBe('## 用户\n\n原始问题\n\n---\n\n## 助手\n\n答案\n```ts\nconst x = 1\n```\n')
  expect(markdown).not.toContain('PRIVATE_THINKING')
})
