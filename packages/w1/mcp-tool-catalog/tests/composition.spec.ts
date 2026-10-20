import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import LlmRuntime, { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { PtcRuntime } from '@deepseek-ai/dsh-ptc-runtime'
import { createMcpToolDefinition, publicToolName } from '../../../mcp/mcp-client/src/tools.ts'
import * as catalog from '../src/index.ts'

async function load(options: { disk?: string; resume?: boolean; maxLoadedTools?: number; maxResponseBytes?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'w1-mcp-catalog-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  const modules = new Map<string, unknown>([
    ['llm', LlmRuntime], ['sessions', SessionStore], ['projections', SessionProjectionRegistry],
    ['agents', AgentRegistry], ['loop', AgentLoop], ['prompt', SystemPrompt], ['tools', ToolRuntime],
    ['catalog', catalog], ['persistence', JsonlPersistence],
  ])
  const file = join(directory, 'cordis.yml')
  await writeFile(file, `${options.disk === undefined ? '' : `- name: persistence\n  config: { root: ${JSON.stringify(options.disk)}, compression: none }\n`}- name: llm
- name: sessions
- name: projections
- name: agents
- name: prompt
- name: tools
- name: loop
  config: { agents: [] }
- id: catalog
  name: catalog
  config: { enabled: true, maxResults: 3, maxResponseBytes: ${options.maxResponseBytes ?? 4096}, maxLoadedTools: ${options.maxLoadedTools ?? 8}, maxLoadedBytes: 65536 }
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
  const artifact = join(directory, 'catalog-result.txt')
  const register = (rawName: string, description = 'fixture operation') => {
    const name = publicToolName('test.server', rawName)
    const definition = createMcpToolDefinition(ctx, { name, serverName: 'test.server', rawName, description,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async call() { await writeFile(artifact, 'executed'); return { content: [{ type: 'text', text: 'written' }] } },
    })
    return { name, dispose: ctx.tools.register(definition) }
  }
  const fixture = register('write.fixture')
  for (let i = 0; i < 20; i++) register(`unrelated-${i}`, 'large declaration '.repeat(100))
  class Adapter extends LlmAdapter {
    requests: GenerateOptions[] = []
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      const step = this.requests.push(options) - 1
      const action = step === 0 ? { name: 'w1_tool_catalog', args: { action: 'search', query: 'write.fixture' } }
        : step === 1 ? { name: 'w1_tool_catalog', args: { action: 'load', names: [fixture.name] } }
          : step === 2 ? { name: fixture.name, args: {} } : null
      if (action === null) { yield { type: 'text-delta', index: 0, text: 'done' }; yield { type: 'finish', reason: { kind: 'stop' } }; return }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId(`call-${step}`), name: action.name, argumentsDelta: JSON.stringify(action.args) }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    }
  }
  const adapter = new Adapter()
  ctx.llm.registerAdapter(['mock'], adapter)
  const agentOptions = { provider: 'mock', model: 'main' }
  const { agent } = options.resume === true
    ? await ctx.agents.resume({ resumeSessionId: SessionId('catalog-test'), agentOptions })
    : await ctx.agents.create({ sessionId: SessionId('catalog-test'), agentOptions, meta: { cwd: directory } })
  const execute = (arguments_: object) => ctx.agents.withInitiator(agent, () => ctx.tools.execute({ signal: new AbortController().signal,
    agent, name: 'w1_tool_catalog', callId: ToolCallId(`manual-${Math.random()}`), arguments: arguments_ }))
  const visible = async () => (await ctx.systemPrompt.assemble({ scope: agent })).tools
  return { ctx, agent, adapter, artifact, fixture, register, execute, visible }
}

describe('Native MCP disclosure in the Loader-composed agent', () => {
  it('searches, discloses next step, and executes the real bridge without leaking origin metadata', async () => {
    const h = await load()
    h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Write the fixture using MCP.' }], source: { kind: 'user' } }))
    await h.agent.whenIdle()
    expect(await readFile(h.artifact, 'utf8')).toBe('executed')
    expect(h.adapter.requests[0]!.tools!.map(tool => tool.name)).toEqual(['w1_tool_catalog'])
    expect(h.adapter.requests[1]!.tools!.map(tool => tool.name)).toEqual(['w1_tool_catalog'])
    expect(h.adapter.requests[2]!.tools!.some(tool => tool.name === h.fixture.name)).toBe(true)
    expect(JSON.stringify(h.adapter.requests[2]!.tools)).not.toContain('serverName')
    const initialBytes = Buffer.byteLength(JSON.stringify(h.adapter.requests[0]!.tools))
    const fullBytes = Buffer.byteLength(JSON.stringify(h.ctx.tools.schemas(h.agent)))
    expect(initialBytes).toBeLessThan(fullBytes / 5)
    expect(h.agent.session.snapshotEvents().some(event => event.type === 'w1/mcp-disclosure')).toBe(true)
    expect(h.agent.session.snapshotEvents().some(event => event.type === 'request/header'
      && event.data.header.tools?.some(tool => tool.name === h.fixture.name))).toBe(true)
  })
  it('preserves raw identities, bounds pages, and refuses unavailable names', async () => {
    const h = await load()
    const found = await h.execute({ action: 'search', query: 'write.fixture' })
    expect(found.isError).toBe(false)
    expect(JSON.stringify(found.value)).toContain('write.fixture')
    expect((await h.execute({ action: 'search' })).value).toMatchObject({ nextOffset: 3 })
    expect((await h.execute({ action: 'load', names: ['made_up_tool'] })).isError).toBe(true)
    expect((await h.visible()).map(tool => tool.name)).not.toContain(h.fixture.name)
  })
  it('revalidates disconnect, reconnect, schema changes and scope revocation at dispatch', async () => {
    const h = await load()
    await h.execute({ action: 'load', names: [h.fixture.name] })
    expect((await h.visible()).map(tool => tool.name)).toContain(h.fixture.name)
    h.fixture.dispose()
    expect((await h.visible()).map(tool => tool.name)).not.toContain(h.fixture.name)
    const next = h.register('write.fixture')
    expect((await h.visible()).map(tool => tool.name)).toContain(h.fixture.name)
    next.dispose(); h.register('write.fixture', 'new schema description')
    expect((await h.visible()).map(tool => tool.name)).not.toContain(h.fixture.name)
    await h.execute({ action: 'load', names: [h.fixture.name] })
    h.agent.ctx.tools.restrict({ deny: [h.fixture.name] })
    expect((await h.execute({ action: 'search', query: 'write.fixture' })).value).toMatchObject({ total: 0 })
    expect((await h.execute({ action: 'load', names: [h.fixture.name] })).isError).toBe(true)
    const denied = await h.ctx.tools.execute({ agent: h.agent, signal: new AbortController().signal, name: h.fixture.name, callId: ToolCallId('denied'), arguments: {} })
    expect(denied.isError).toBe(true)
  })
  it('refuses disclosure beyond the configured count without partial loading', async () => {
    const h = await load({ maxLoadedTools: 1 })
    const second = h.register('second')
    expect((await h.execute({ action: 'load', names: [h.fixture.name, second.name] })).isError).toBe(true)
    expect((await h.visible()).map(tool => tool.name)).toEqual(['w1_tool_catalog'])
  })
  it('preserves PTC presentation and its SDK descriptions', async () => {
    const h = await load()
    class FixturePtc extends PtcRuntime {
      readonly language = 'typescript'
      readonly isolation = 'process'
      resolve(): never { throw new Error('Schema-only fixture cannot execute a program') }
      run(): never { throw new Error('Schema-only fixture cannot execute a program') }
    }
    await h.ctx.plugin(FixturePtc)
    h.agent.ctx.tools.presentAs('ptc')
    const assembly = await h.ctx.systemPrompt.assemble({ scope: h.agent })
    expect(assembly.tools.map(tool => tool.name)).toEqual(['run_code'])
    expect(JSON.stringify(assembly.sections)).toContain(h.fixture.name)
    expect(h.agent.session.snapshotEvents().some(event => event.type === 'w1/mcp-disclosure')).toBe(false)
  })
  it('keeps independent sessions undisclosed and bounds the complete multibyte search response', async () => {
    const h = await load({ maxResponseBytes: 256 })
    h.register('large', '检索说明'.repeat(200))
    const oversized = await h.execute({ action: 'search', query: 'large' })
    expect(oversized.isError).toBe(true)
    await h.execute({ action: 'load', names: [h.fixture.name] })
    const { agent } = await h.ctx.agents.create({ sessionId: SessionId('separate'), agentOptions: { provider: 'mock', model: 'main' }, meta: { cwd: tmpdir() } })
    expect((await h.ctx.systemPrompt.assemble({ scope: agent })).tools.map(tool => tool.name)).toEqual(['w1_tool_catalog'])
  })
  it('withholds a declaration when its persistence flush fails, and permits an explicit repair', async () => {
    const disk = await mkdtemp(join(tmpdir(), 'w1-mcp-flush-'))
    onTestFinished(() => rm(disk, { recursive: true, force: true }))
    const h = await load({ disk })
    const spy = vi.spyOn(h.ctx.get('sessionPersistence')!, 'flush').mockRejectedValueOnce(new Error('Test disk unavailable'))
    expect((await h.execute({ action: 'load', names: [h.fixture.name] })).isError).toBe(true)
    expect((await h.visible()).map(tool => tool.name)).not.toContain(h.fixture.name)
    spy.mockRestore()
    expect((await h.execute({ action: 'load', names: [h.fixture.name] })).isError).toBe(false)
    expect((await h.visible()).map(tool => tool.name)).toContain(h.fixture.name)
  })
  it('restores disclosures after a disk-backed Host restart and disposes the catalog', async () => {
    const disk = await mkdtemp(join(tmpdir(), 'w1-mcp-durable-'))
    onTestFinished(() => rm(disk, { recursive: true, force: true }))
    const first = await load({ disk })
    expect((await first.execute({ action: 'load', names: [first.fixture.name] })).isError).toBe(false)
    await first.ctx.fiber.dispose()
    const second = await load({ disk, resume: true })
    expect((await second.visible()).map(tool => tool.name)).toContain(second.fixture.name)
    expect(second.adapter.requests).toHaveLength(0)
    const entry = [...second.ctx.loader.entries()].find(item => item.options.name === 'catalog')!
    await entry.fiber!.dispose()
    expect(second.ctx.tools.get('w1_tool_catalog')).toBeUndefined()
    expect((await second.visible()).length).toBe(21)
  })
})
