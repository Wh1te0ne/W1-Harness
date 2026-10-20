import { describe, expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import LlmRuntime, { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { adapter as nativeAdapter, server, MODEL } from '../../../llm/llm-deepseek/tests/helpers.ts'
import { requestStructure } from '../../../llm/llm-deepseek/src/request-structure.ts'
import * as diagnostics from '../src/index.ts'
import { changes, normalizedStructure } from '../src/compare.ts'

async function load(wire = false) {
  const directory = await mkdtemp(join(tmpdir(), 'w1-cache-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  const modules = new Map<string, unknown>([
    ['llm', LlmRuntime], ['sessions', SessionStore], ['projections', SessionProjectionRegistry],
    ['agents', AgentRegistry], ['loop', AgentLoop], ['prompt', SystemPrompt], ['tools', ToolRuntime], ['diagnostics', diagnostics],
  ])
  const file = join(directory, 'cordis.yml')
  await writeFile(file, `- name: llm
- name: sessions
- name: projections
- name: agents
- name: prompt
- name: tools
- name: loop
  config: { agents: [] }
- id: diagnostics
  name: diagnostics
  config: { enabled: true, maxSessions: 2, maxRoutes: 2, maxMessages: 30, maxReports: 3 }
`)
  ctx.baseUrl = pathToFileURL(directory).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) { if (!modules.has(name)) throw new Error(name); return modules.get(name) }, loadCache: new Map(),
    register(): never { throw new Error('Unexpected module hook registration') },
    getOrCreateModuleJob(): never { throw new Error('Unexpected module job creation') },
    resolveSync(): never { throw new Error('Unexpected synchronous resolution') },
    load(): never { throw new Error('Unexpected module load') },
  }
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
  await ctx.loader.await()
  class Adapter extends LlmAdapter {
    requests: GenerateOptions[] = []
    usage: TokenUsage = { inputTokens: 20, outputTokens: 3, cacheReadTokens: 80, cacheWriteTokens: 0 }
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      this.requests.push(options)
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 0 } }
      yield { type: 'text-delta', index: 0, text: 'fixture answer' }
      yield { type: 'usage', usage: this.usage }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const adapter = new Adapter()
  if (wire) {
    const endpoint = await server()
    onTestFinished(() => endpoint.close())
    ctx.llm.registerAdapter(['mock'], nativeAdapter({ baseURL: endpoint.url }, { onRequestPrepared: (detail) => { ctx.emit('llm-deepseek/request-prepared', detail) } }))
  } else ctx.llm.registerAdapter(['mock'], adapter)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('cache-test'), agentOptions: { provider: 'mock', model: wire ? MODEL : 'main' }, meta: { cwd: directory } })
  const send = async (text = 'fixture prompt') => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  const reports = () => ctx.sessionProjections.snapshot(agent.session).values.w1CacheDiagnostics!
  return { ctx, agent, adapter, send, reports }
}

describe('cache diagnostics in Loader-composed conversations', () => {
  it('compares appended messages, keeps the last cumulative usage and excludes auxiliary calls', async () => {
    const h = await load()
    await h.send(); await h.send('next prompt')
    expect(h.reports().map(report => report.status)).toEqual(['cold', 'stable'])
    expect(h.reports()[1]).toMatchObject({ inputTokens: 20, cacheReadTokens: 80, observedInputTokens: 100, causes: [], channel: 'normalized' })
    const count = h.reports().length
    const call = await h.ctx.llm.prepareCall({ provider: 'mock', model: 'main' })
    for await (const _chunk of call.stream({ ...call.config, sessionId: h.agent.session.id, messages: [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'auxiliary' }] })] })) {}
    expect(h.reports()).toHaveLength(count)
    expect(JSON.stringify(h.reports())).not.toContain('fixture prompt')
    expect(JSON.stringify(h.reports())).not.toContain('fixture answer')
  })
  it('distinguishes suspected misses, changed instructions and missing cache counters', async () => {
    const h = await load()
    await h.send()
    h.adapter.usage = { inputTokens: 100, outputTokens: 3, cacheReadTokens: 0 }
    await h.send()
    expect(h.reports().at(-1)?.status).toBe('suspected-miss')
    h.ctx.systemPrompt.section({ name: 'changed', order: 10, text: 'Changed system instructions.' })
    await h.send()
    expect(h.reports().at(-1)).toMatchObject({ status: 'expected-rebuild' })
    h.adapter.usage = { inputTokens: 100, outputTokens: 3 }
    await h.send()
    expect(h.reports().at(-1)).toMatchObject({ status: 'unknown' })
    expect(h.reports().at(-1)?.cacheReadTokens).toBeUndefined()
    expect(h.reports().at(-1)?.observedInputTokens).toBeUndefined()
    expect(h.reports()).toHaveLength(3)
  })
  it('observes actual serialized DeepSeek requests through a loopback HTTP endpoint', async () => {
    const h = await load(true)
    await h.send('serialized fixture')
    expect(h.reports().at(-1)).toMatchObject({ channel: 'deepseek-wire' })
    expect(typeof h.reports().at(-1)!.messageCount).toBe('number')
    expect(h.reports().at(-1)!.requestBytes).toBeGreaterThan(0)
    expect(JSON.stringify(h.reports())).not.toContain('serialized fixture')
    expect(JSON.stringify(h.reports())).not.toContain('test-key')
  })
  it('removes its observer and projection when unloaded', async () => {
    const h = await load()
    await h.send()
    const entry = [...h.ctx.loader.entries()].find(item => item.options.name === 'diagnostics')!
    await entry.fiber!.dispose()
    await h.send()
    expect(h.reports()).toBeUndefined()
    expect(h.adapter.requests).toHaveLength(2)
  })
})

describe('content-free request comparison', () => {
  it('ignores request metadata and detects actual tool order and earlier message changes', () => {
    const payload = { system: 'secret prompt', tools: [{ name: 'a' }, { name: 'b' }], messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] }
    const a = requestStructure(JSON.stringify({ ...payload, metadata: { request_id: 'a' } }), 2)
    const b = requestStructure(JSON.stringify({ ...payload, metadata: { request_id: 'b' } }), 2)
    expect(changes(a, b)).toEqual([])
    expect(changes(a, requestStructure(JSON.stringify({ ...payload, tools: payload.tools.toReversed() }), 2))).toContain('tools')
    expect(changes(a, requestStructure(JSON.stringify({ ...payload, messages: [{ role: 'user', content: 'changed' }] }), 2))).toContain('messages')
    expect(changes(a, requestStructure(JSON.stringify({ ...payload, output_config: { effort: 'high' } }), 2))).toContain('settings')
    expect(JSON.stringify(a)).not.toContain('secret prompt')
  })
  it('does not call a truncated comparison stable and ignores normalized message ids', () => {
    const first = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'one' }] })
    const second = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'two' }] })
    const options: GenerateOptions = { provider: 'mock', model: 'main', messages: [first, second] }
    const a = normalizedStructure(options, 1)
    const b = normalizedStructure({ ...options, messages: [...options.messages, first] }, 1)
    expect(changes(a, b)).toContain('comparison-limit')
    expect(changes(normalizedStructure({ ...options, messages: [first] }, 2), normalizedStructure({ ...options, messages: [createUserMessage({ source: { kind: 'user' }, content: first.content })] }, 2))).toEqual([])
  })
})
