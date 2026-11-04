/** Disclosure filters preserve executor admission and are owned by plugin scopes. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import Tools, { defineTool } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  await ctx.plugin(NativeToolExecutor)
  for (const name of ['first', 'second']) {
    ctx.tools.register(defineTool({ name, description: name, parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return name },
    }))
  }
  return ctx
}

it('omits declarations without removing executable definitions and restores them on unload', async () => {
  const ctx = await setup()
  const filter = ctx.plugin(Object.assign((inner: Context) => {
    inner.tools.filterDeclarations((schema, context) => {
      expect(context.schemas.map(item => item.name)).toEqual(['first', 'second'])
      return schema.name !== 'first'
    })
  }, { inject: ['tools'] }))
  await filter
  expect((await ctx.systemPrompt.assemble()).tools.map(tool => tool.name)).toEqual(['second'])
  expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['first', 'second'])
  const input = { name: 'first', callId: ToolCallId('direct'), arguments: {}, signal: new AbortController().signal }
  expect((await executeToolFixture(ctx, input)).isError).toBe(false)
  const releaseGuard = ctx.tools.guard(() => 'Execution remains denied by the guard')
  expect((await executeToolFixture(ctx, input)).isError).toBe(true)
  releaseGuard()
  await filter.dispose()
  expect((await ctx.systemPrompt.assemble()).tools.map(tool => tool.name)).toEqual(['first', 'second'])
})

it('intersects global and scoped disclosure while preserving independent scopes', async () => {
  const ctx = await setup()
  const agent = {} as Agent
  const other = {} as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, agent) }, { inject: ['tools'] }))
  ctx.tools.filterDeclarations(schema => schema.name !== 'first')
  scope.ctx.tools.filterDeclarations(schema => schema.name !== 'second')
  expect((await ctx.systemPrompt.assemble({ scope: agent })).tools).toEqual([])
  expect((await ctx.systemPrompt.assemble({ scope: other })).tools.map(tool => tool.name)).toEqual(['second'])
})

it('fails prompt assembly when a disclosure policy throws', async () => {
  const ctx = await setup()
  ctx.tools.filterDeclarations(() => { throw new Error('Disclosure unavailable') })
  await expect(ctx.systemPrompt.assemble()).rejects.toThrow('Disclosure unavailable')
})
