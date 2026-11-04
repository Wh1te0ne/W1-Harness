import { expect, it, onTestFinished } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { LlmAdapter, createUserMessage, createMessage, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import { SqliteSessionQueryEngine } from '@deepseek-ai/dsh-session-query-sqlite'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import Approval from '@deepseek-ai/dsh-user-approval'
import PermissionPresets, { AUTO_PRESET } from '@deepseek-ai/dsh-permission-presets'
import * as AutoReview from '../src/index.ts'

interface ReceiptTotals { apiCost: number; calls: number }
interface UsageConfig {
  prices: { manual: Record<string, object>; book: { accounting?: { version: number } } }
}
interface UsageLedger {
  close(): void
  account(tokens: object, model: string, session: string, time: number, provider: string, metadata: object): void
}
type StreamListener = (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>
type Account = (usage: { inputTokens: number; outputTokens: number }, model: string, session: string,
  time: number, provider: string, metadata: object) => void

it('Loader-composed reviews persist parent and child costs in one ledger and leave no unassigned expense', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'w1-review-billing-'))
  const ctx = new Context()
  const usageRoot = new URL('../../../w1/usage/lib/', import.meta.url)
  const { Ledger, defaultConfig } = await import(new URL('store.js', usageRoot).href) as {
    Ledger: { load(path: string): UsageLedger }
    defaultConfig: () => UsageConfig
  }
  const { createPriceBook } = await import(new URL('price-book.js', usageRoot).href) as {
    createPriceBook: (config: UsageConfig, time: number) => UsageConfig['prices']['book']
  }
  const { createLlmStreamBilling } = await import(new URL('billing-stream.js', usageRoot).href) as {
    createLlmStreamBilling: (options: { now(): number; account: Account }) => StreamListener
  }
  const { getSessionCost, hydrateSessionTitles } = await import(new URL('session-tree.js', usageRoot).href) as {
    getSessionCost: (ledger: UsageLedger, context: Context, id: string) => Promise<{ own: ReceiptTotals; subagents: ReceiptTotals }>
    hydrateSessionTitles: (context: Context, rows: { id: string; title?: string }[]) => Promise<{ id: string; title?: string }[]>
  }
  const { billingStatistics } = await import(new URL('billing-statistics.js', usageRoot).href) as {
    billingStatistics: (ledger: UsageLedger, query: object, ids: null, headers: object[]) => {
      sessions: ReceiptTotals[]
      totals: ReceiptTotals
      unassigned: ReceiptTotals
    }
  }
  const at = Date.parse('2026-10-23T01:00:00Z')
  const config = defaultConfig()
  config.prices.manual = { 'review:model': { currency: 'CNY', input: 1, cachedInput: 0.1, output: 2 } }
  config.prices.book = createPriceBook(config, at - 1)
  config.prices.book.accounting = { version: 1 }
  const ledgerPath = join(directory, 'ledger.json')
  await writeFile(ledgerPath, JSON.stringify({ version: 1, config, days: {} }))
  const ledger = Ledger.load(ledgerPath)
  onTestFinished(async () => { ledger.close(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  provideWorkingDirectoryFixture(ctx)
  ctx.provide('shell', {
    sandboxMode: 'workspace-write',
    resolve() { throw Error('Billing fixture does not run shell commands') },
    run() { throw Error('Billing fixture does not run shell commands') },
    start() { throw Error('Billing fixture does not run shell commands') },
  })
  const modules = new Map<string, unknown>([['llm', LlmRuntime], ['sessions', SessionStore], ['query', SqliteSessionQueryEngine], ['projections', Projections], ['prompt', SystemPrompt], ['tools', Tools], ['approval', Approval], ['permissions', PermissionPresets], ['review', AutoReview]])
  const file = join(directory, 'cordis.yml')
  await writeFile(file, '- name: llm\n  config: { requestTransportByPurpose: { auto-review: { isolated: true, headers: { x-utility: \"1\" } } } }\n- name: sessions\n- name: query\n  config: { path: ":memory:", openAt: never }\n- name: projections\n- name: prompt\n- name: tools\n- name: approval\n  config: { policy: ask }\n- name: permissions\n- name: review\n')
  ctx.baseUrl = pathToFileURL(directory).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    version: 'v2', async import(name: string) { if (!modules.has(name)) throw Error('Unknown fixture module'); return modules.get(name) }, loadCache: new Map(),
    register(): never { throw Error('Unexpected registration') }, getOrCreateModuleJob(): never { throw Error('Unexpected module job') },
    resolveSync(): never { throw Error('Unexpected resolution') }, load(): never { throw Error('Unexpected module load') },
  }
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
  await ctx.loader.await()
  const account: Account = (u, m, s, time, p, meta) => {
    ledger.account({ input: u.inputTokens, output: u.outputTokens }, m, s, time, p, meta)
  }
  ctx.on('llm/stream', createLlmStreamBilling({ now: () => at, account }), { global: true })
  const requests: GenerateOptions[] = []
  class Adapter extends LlmAdapter {
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      const text = '{"risk":"low","decision":"allow"}'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 10 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['review'], new Adapter())
  let executions = 0
  ctx.tools.register(defineContentToolFixture({ name: 'probe', description: 'Read a fixture.', parameters: {}, async execute() { executions++; return [{ type: 'text', text: 'ok' }] } }))
  const parent = ctx.sessions.create(SessionId('parent'), { meta: { cwd: directory } })
  const child = ctx.sessions.create(SessionId('child'), { meta: { cwd: directory, parentSession: parent.id, origin: 'subagent' } })
  for (const session of [parent, child]) {
    ctx.permissionPresets.set(session, AUTO_PRESET)
    const agent = { id: session.id, session, options: { provider: 'review', model: 'model' } } as Agent
    session.append('request/header', { header: { config: { provider: 'review', model: 'model' }, tools: [{ name: 'probe', description: 'Read a fixture.', parameters: { type: 'object', properties: {} } }] }, reason: 'initial' })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Read the fixture.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const callId = ToolCallId(session.id + '-call')
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({ role: 'assistant', content: [{ type: 'tool-call', id: callId, name: 'probe', arguments: '{}' }], source: { kind: 'model', provider: 'review', model: 'model' } }) }, { surfaceOp: 'append' })
    session.append('tool/call', { turn: 1, step: 1, callId, name: 'probe', arguments: '{}' })
    const result = await ctx.tools.execute({ signal: new AbortController().signal, callId, name: 'probe', arguments: {}, agent })
    expect(result.isError).toBe(false)
  }
  expect(executions).toBe(2)
  expect(requests.map(r => [r.sessionId, r.purpose])).toEqual([['parent', 'auto-review'], ['child', 'auto-review']])
  expect(requests.every(r => r.transport?.isolated && r.transport.headers?.['x-utility'] === '1')).toBe(true)
  const badges = await getSessionCost(ledger, ctx, parent.id)
  const stats = billingStatistics(ledger, { from: '2026-10-23', to: '2026-10-23' }, null, [parent.header, child.header])
  expect(badges.own.apiCost + badges.subagents.apiCost).toBeCloseTo(0.00008)
  expect(stats.sessions[0]?.apiCost).toBeCloseTo(stats.totals.apiCost)
  expect(stats.unassigned.apiCost).toBe(0)
  expect(stats.totals.calls).toBe(2)
  expect(JSON.stringify(parent.deriveMessages())).not.toContain('REVIEW_POLICY')
  parent.append('session/title', { title: 'Parent title from events', messageSeqs: [], source: { kind: 'fallback' } })
  child.append('session/title', { title: 'Child title from events', messageSeqs: [], source: { kind: 'fallback' } })
  const named = await hydrateSessionTitles(ctx, [{ id: parent.id }, { id: child.id }])
  expect(named.map(row => row.title)).toEqual(['Parent title from events', 'Child title from events'])
})
