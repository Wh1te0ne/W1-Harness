/** Keyless Agent-loop recording with a synthetic browser transport. */
import { expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import BrowserUseRegistry from '@deepseek-ai/dsh-browser-use'
import LlmRuntime, { LlmAdapter, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as browser from '../src/index.ts'
import * as policy from '@deepseek-ai/dsh-w1-tool-selection'

class BrowserModel extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const commands = [{ action: 'list' }, { action: 'open', url: 'https://fixture.test/' }, { action: 'read', tab: 'owned-tab' }, { action: 'fill', tab: 'owned-tab', ref: 'snapshot:1', text: 'W1' }, { action: 'read', tab: 'owned-tab' }]
    const command = commands[this.requests.length - 1]
    if (command !== undefined) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(`browser-${this.requests.length}`), name: 'w1_browser', arguments: JSON.stringify(command) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Verified that the name field contains W1.' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

it('logs browser observations before the next request and binds calls to the executing conversation', async () => {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(policy)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(BrowserUseRegistry)
  const owners: string[] = []
  let value = ''
  await ctx.plugin(browser, { timeoutMs: 1000, maxTextChars: 1000, maxElements: 10,
    async request(sessionId, command) {
      owners.push(sessionId)
      if (command.action === 'list') return { text: '[]' }
      if (command.action === 'open') return { text: '{"tab":"owned-tab","url":"https://fixture.test/"}' }
      if (command.action === 'read') return { text: JSON.stringify({ elements: [{ ref: value ? 'snapshot:2' : 'snapshot:1', label: 'Name', value }] }) }
      if (command.action === 'fill') value = command.text
      return { text: '{"delivered":true,"message":"Read the page to verify the result."}' }
    },
  })
  const model = new BrowserModel()
  ctx.llm.registerAdapter(['browser-fixture'], model)
  const agent = await ctx.agentLoop.create(SessionId('browser-owner'), { provider: 'browser-fixture', model: 'text' })
  const idle = Promise.withResolvers<undefined>()
  const stop = ctx.on('agent/status', ({ agent: current, status }) => { if (current === agent && status === 'idle') idle.resolve(undefined) })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Set the name on https://fixture.test/ to W1 and check the result.' }], source: { kind: 'user' } }))
  await idle.promise
  stop()
  expect(owners).toEqual(Array.from({ length: 5 }, () => 'browser-owner'))
  expect(model.requests).toHaveLength(6)
  const firstRequest = JSON.stringify(model.requests[0]?.messages)
  expect(firstRequest).toContain('## Tool selection')
  expect(firstRequest).toContain('## Browser environment selection')
  expect(firstRequest).toContain('## Built-in browser workflow')
  expect(firstRequest).toContain('Do not run browser or desktop acceptance when the user excluded it')
  expect(JSON.stringify(agent.session.deriveMessages())).toContain('## Tool selection')
  const results = agent.session.deriveMessages().filter(message => message.role === 'tool').map(message => message.content)
  expect(results).toMatchSnapshot()
  expect(JSON.stringify(model.requests[3]?.messages)).toContain('snapshot:1')
  expect(JSON.stringify(model.requests[5]?.messages)).toContain('snapshot:2')
  expect(value).toBe('W1')
  expect(agent.session.snapshotEvents().filter(event => event.type === 'tool/result')).toHaveLength(5)
})
