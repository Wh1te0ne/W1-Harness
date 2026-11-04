import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import LlmRuntime, { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SubagentModelSelectionConfig from '@deepseek-ai/dsh-tool-subagent/model-selection-settings'
import * as replies from '../src/index.ts'
import { normalizeSuggestion, selectedRoute, suggestionPrompt } from '../src/generation.ts'

class Adapter extends LlmAdapter {
  requests: GenerateOptions[] = []
  selection = '{"provider":"mock","model":"small"}'
  hold = false
  failSuggestion = false
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const suggest = options.system === suggestionPrompt
    if (suggest && this.failSuggestion) throw new Error('Test provider unavailable')
    if (suggest && this.hold) await new Promise<void>((resolve) => {
      if (options.signal?.aborted) resolve()
      else options.signal?.addEventListener('abort', () => { resolve() }, { once: true })
    })
    const text = suggest ? '请先说明需要改哪些地方。' : options.system?.startsWith('Choose one') === true
      ? this.selection : '可以在输入框里加入回复建议。'
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function load(enabled = true, options: {
  seed?: readonly SessionEvent[]
  disabled?: boolean
  adapter?: Adapter
  persistenceRoot?: string
  resume?: boolean
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'w1-replies-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const modules = new Map<string, unknown>([
    ['llm', LlmRuntime], ['sessions', SessionStore], ['projections', SessionProjectionRegistry],
    ['agents', AgentRegistry], ['loop', AgentLoop], ['prompt', SystemPrompt], ['tools', ToolRuntime],
    ['policy', SubagentModelSelectionConfig], ['replies', replies],
    ['persistence', JsonlPersistence],
  ])
  const file = join(root, 'cordis.yml')
  await writeFile(file, `${options.persistenceRoot === undefined ? '' : `- name: persistence
  config: { root: ${JSON.stringify(options.persistenceRoot)}, compression: none }
`}- name: llm
- name: sessions
- name: projections
- name: agents
- name: prompt
- name: tools
- name: loop
  config: { agents: [] }
- name: policy
  config:
    enabled: ${enabled}
    allowedModels: [{ provider: mock, model: small }]
- id: replies
  name: replies
  disabled: ${options.disabled === true}
  config:
    maxContextCharacters: 1000
    maxMessages: 6
    maxSuggestionCharacters: 240
    maxOutputTokens: 768
    maxInputBytes: 65536
    timeoutMs: 1000
`)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (!modules.has(name)) throw new Error(`Unexpected module ${name}`)
    return modules.get(name)
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
  await ctx.loader.await()
  const adapter = options.adapter ?? new Adapter()
  ctx.llm.registerAdapter(['mock'], adapter)
  const agentOptions = {
    sessionId: SessionId('reply-test'), agentOptions: { provider: 'mock', model: 'main' },
    ...options.seed === undefined ? {} : { seed: options.seed },
  }
  const { agent } = options.resume === true
    ? await ctx.agents.resume({ resumeSessionId: agentOptions.sessionId, agentOptions: agentOptions.agentOptions })
    : await ctx.agents.create({ ...agentOptions, meta: { cwd: root } })
  const send = (text: string) => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  }
  const suggestion = () => ctx.sessionProjections.snapshot(agent.session).values.w1ReplySuggestion
  return { ctx, adapter, agent, send, suggestion }
}

describe('W1 reply suggestions in a Loader-composed conversation', () => {
  it('flushes suggestions to JSONL and reuses them after the Host is rebuilt from disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'w1-reply-durable-'))
    onTestFinished(async () => { await rm(directory, { recursive: true, force: true }) })
    const first = await load(true, { persistenceRoot: directory })
    first.send('保存这次的回复建议')
    await vi.waitFor(() => { expect(first.suggestion()?.text).toBeTruthy() })
    await first.ctx.get('sessionPersistence')!.flush()
    const saved = first.suggestion()
    await first.ctx.fiber.dispose()
    const second = await load(true, { persistenceRoot: directory, resume: true })
    await second.agent.whenIdle()
    expect(second.suggestion()).toEqual(saved)
    expect(second.adapter.requests).toHaveLength(0)
    await second.ctx.fiber.dispose()
  })

  it('backfills a historical conversation once and restores the saved suggestion without any model request', async () => {
    const old = await load(false, { disabled: true })
    old.send('旧会话中的问题')
    await old.agent.whenIdle()
    const restored = await load(true, { seed: old.agent.session.snapshotEvents() })
    await vi.waitFor(() => { expect(restored.suggestion()?.text).toBeTruthy() })
    expect(restored.adapter.requests.map(request => request.model)).toEqual(['main', 'small'])
    const saved = restored.agent.session.snapshotEvents()
    expect(saved.filter(event => event.type === 'w1/reply-attempt')).toHaveLength(1)
    const reopened = await load(true, { seed: saved })
    await reopened.agent.whenIdle()
    expect(reopened.suggestion()).toEqual(restored.suggestion())
    expect(reopened.adapter.requests).toHaveLength(0)
    reopened.send('继续问一个新问题')
    await vi.waitFor(() => { expect(reopened.suggestion()?.turn).toBe(2) })
    expect(reopened.adapter.requests.map(request => request.model)).toEqual(['main', 'small'])
  })

  it('persists failed attempts so reopening does not repeatedly buy generation', async () => {
    const adapter = new Adapter()
    adapter.failSuggestion = true
    const failed = await load(false, { adapter })
    failed.send('给我一条建议')
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(2) })
    const reopened = await load(false, { seed: failed.agent.session.snapshotEvents() })
    await reopened.agent.whenIdle()
    expect(reopened.suggestion()).toBeNull()
    expect(reopened.adapter.requests).toHaveLength(0)
  })

  it('does not backfill an interrupted historical turn', async () => {
    const old = await load(false, { disabled: true })
    old.send('未完成的旧问题')
    await old.agent.whenIdle()
    const seed = old.agent.session.snapshotEvents().filter(event => event.type !== 'turn/end')
    const restored = await load(false, { seed })
    await restored.agent.whenIdle()
    expect(restored.adapter.requests).toHaveLength(0)
    expect(restored.suggestion()).toBeNull()
  })

  it('uses the main model to choose, caches the choice and keeps suggestions out of main history', async () => {
    const h = await load()
    h.send('可以给输入框增加一个回复建议吗？')
    await vi.waitFor(() => { expect(h.suggestion()?.text).toBe('请先说明需要改哪些地方。') })
    expect(h.adapter.requests.map(r => r.model)).toEqual(['main', 'main', 'small'])
    expect(h.adapter.requests.map(r=>r.purpose)).toEqual([undefined,'reply-selection','reply-suggestion'])
    expect(h.adapter.requests.slice(1).map(r => ({
      model: r.model, system: r.system, tools: r.tools ?? [], maxTokens: r.maxTokens,
    }))).toMatchSnapshot()
    expect(h.agent.session.deriveMessages().flatMap(m => m.content).filter(b => b.type === 'text').map(b => b.text)).not.toContain('请先说明需要改哪些地方。')
    h.send('下一步呢？')
    await vi.waitFor(() => { expect(h.suggestion()?.turn).toBe(2) })
    expect(h.adapter.requests.map(r => r.model)).toEqual(['main', 'main', 'small', 'main', 'small'])
    expect(h.agent.inbox.nextTurn).toHaveLength(0)
  })

  it('inherits the main model when selection is disabled or returns a disallowed route', async () => {
    const inherited = await load(false)
    inherited.send('解释一下')
    await vi.waitFor(() => { expect(inherited.suggestion()?.text).toBeTruthy() })
    expect(inherited.adapter.requests.map(r => r.model)).toEqual(['main', 'main'])
    const invalid = await load()
    invalid.adapter.selection = '{"provider":"unknown","model":"expensive"}'
    invalid.send('解释一下')
    await vi.waitFor(() => { expect(invalid.suggestion()?.text).toBeTruthy() })
    expect(invalid.adapter.requests.map(r => r.model)).toEqual(['main', 'main', 'main'])
  })

  it('cancels stale generation and drains work when the plugin is unloaded', async () => {
    const h = await load(false)
    h.adapter.hold = true
    h.send('第一轮')
    await vi.waitFor(() => { expect(h.adapter.requests).toHaveLength(2) })
    const previous = h.adapter.requests[1]!
    h.send('第二轮')
    await vi.waitFor(() => { expect(previous.signal?.aborted).toBe(true) })
    await vi.waitFor(() => { expect(h.adapter.requests).toHaveLength(4) })
    expect(h.suggestion()).toBeNull()
    const entry = [...h.ctx.loader.entries()].find(entry => entry.options.name === 'replies')!
    await entry.fiber!.dispose()
    expect(h.adapter.requests[3]!.signal?.aborted).toBe(true)
    expect(h.ctx.sessionProjections.snapshot(h.agent.session).values.w1ReplySuggestion).toBeUndefined()
  })

  it('validates model output and Unicode bounds', () => {
    expect(selectedRoute('not JSON', [])).toBeNull()
    expect(normalizeSuggestion('/delete everything', 240)).toBe('')
    expect(normalizeSuggestion('好'.repeat(241), 240)).toBe('')
    expect(normalizeSuggestion(' 请先\n解释方案。 ', 240)).toBe('请先 解释方案。')
  })
})
