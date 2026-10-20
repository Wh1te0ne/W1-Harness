/** Real Cordis tool registration with a synthetic transport, without desktop access. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import BrowserUseRegistry from '@deepseek-ai/dsh-browser-use'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as browser from '../src/index.ts'
import { browserCommandSchema } from '../src/protocol.ts'

let ctx: Context
beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(BrowserUseRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
})
afterEach(async () => { await ctx.fiber.dispose() })
const options = { timeoutMs: 1000, maxTextChars: 100, maxElements: 10 }
it('registers a single browser tool and releases the provider on unload', async () => {
  const request = vi.fn(async () => ({ text: '[]' }))
  const fiber = ctx.plugin(browser, { ...options, request }); await fiber
  expect(ctx.browserUse.providerName).toBe('w1-built-in')
  expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['w1_browser'])
  expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('## Built-in browser workflow')
  const result = await ctx.tools.execute({ name: 'w1_browser', callId: ToolCallId('test'), arguments: { action: 'list' }, signal: new AbortController().signal })
  expect(result.isError).toBe(true)
  expect(request).not.toHaveBeenCalled()
  expect(result.content).toMatchInlineSnapshot(`
    [
      {
        "text": "Error: Browser control requires an owning conversation",
        "type": "text",
      },
    ]
  `)
  await fiber.dispose()
  expect(ctx.tools.schemas()).toEqual([])
  expect(ctx.browserUse.providerName).toBeUndefined()
  expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain('## Built-in browser workflow')
})
it('hides browser workflow guidance when the tool is denied in an agent scope', async () => {
  await ctx.plugin(browser, { ...options, request: async () => ({ text: '[]' }) })
  const key = {} as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key) }, { inject: ['tools', 'systemPrompt'] }))
  scope.ctx.tools.restrict({ deny: ['w1_browser'] })
  expect(ctx.tools.schemas(key)).toEqual([])
  expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))).not.toContain('## Built-in browser workflow')
  expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('After a frontend change')
})
it('validates each action instead of trusting the broad model schema', () => {
  expect(() => browserCommandSchema.parse({ action: 'fill', tab: 't', ref: 'r' })).toThrow()
  expect(() => browserCommandSchema.parse({ action: 'press', tab: 't', key: 'Control+L' })).toThrow()
  expect(browserCommandSchema.parse({ action: 'scroll', tab: 't', direction: 'down' })).toEqual({ action: 'scroll', tab: 't', direction: 'down', pixels: 600 })
})
it('registers Chrome inside the existing provider and removes its workflow when scoped out', async () => {
  const chromeRequest = vi.fn(async () => ({ text: '{}' }))
  const fiber = ctx.plugin(browser, { ...options, request: async () => ({ text: '[]' }), chromeRequest })
  await fiber
  expect(ctx.browserUse.providerName).toBe('w1-built-in')
  expect(ctx.tools.schemas().map(tool => tool.name).sort()).toEqual(['w1_browser', 'w1_chrome'])
  expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('## External Chrome workflow')
  const key = {} as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key) }, { inject: ['tools', 'systemPrompt'] }))
  scope.ctx.tools.restrict({ deny: ['w1_chrome'] })
  expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))).not.toContain('## External Chrome workflow')
  const refused = await ctx.tools.execute({ name: 'w1_chrome', callId: ToolCallId('chrome'), arguments: { action: 'connect' }, signal: new AbortController().signal })
  expect(refused.isError).toBe(true)
  expect(chromeRequest).not.toHaveBeenCalled()
  await fiber.dispose()
  expect(ctx.tools.schemas()).toEqual([])
})
