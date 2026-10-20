import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { expect, it, onTestFinished } from 'vitest'
import * as policy from '../src/index.ts'

it('keeps general selection guidance without advertising absent browser tools, and unloads cleanly', async () => {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const fiber = ctx.plugin(policy)
  await fiber
  const prompt = renderPrompt(await ctx.systemPrompt.assemble())
  expect(prompt).toContain('the user need not name a tool')
  expect(prompt).toContain('Use file tools')
  expect(prompt).toContain('page fetching for a known URL')
  expect(prompt).not.toContain('w1_browser')
  expect(ctx.tools.schemas()).toEqual([])
  await fiber.dispose()
  expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain('## Tool selection')
})

it('includes only available browser environments and identifies missing Chrome access', async () => {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(policy)
  const key = {} as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key) }, { inject: ['tools', 'systemPrompt'] }))
  const removeBuiltIn = scope.ctx.tools.register({
    name: 'w1_browser', description: 'Synthetic browser declaration', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
    execute: async () => '',
  })
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))
  expect(prompt).toContain('Honor an explicitly named browser or tab first')
  expect(prompt).toContain('localhost development')
  expect(prompt).toContain('separate from the user\'s regular Chrome profile')
  expect(prompt).toContain('External Chrome control is unavailable')
  expect(ctx.tools.schemas(key).map(tool => tool.name)).toEqual(['w1_browser'])
  expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain('## Browser environment selection')
  scope.ctx.tools.register({
    name: 'w1_chrome', description: 'Synthetic Chrome declaration', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
    execute: async () => '',
  })
  const both = renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))
  expect(both).toContain('Use w1_chrome for an explicitly requested external Chrome tab')
  expect(both).not.toContain('External Chrome control is unavailable')
  removeBuiltIn()
  const chromeOnly = renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))
  expect(chromeOnly).toContain('Use w1_chrome')
  expect(chromeOnly).not.toContain('Use w1_browser')
})
