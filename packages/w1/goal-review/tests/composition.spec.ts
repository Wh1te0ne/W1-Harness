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
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import GoalService from '@deepseek-ai/dsh-goal'
import * as toolGoal from '@deepseek-ai/dsh-tool-goal'
import * as review from '../src/index.ts'
import { reviewPrompt } from '../src/evidence.ts'

async function load(settings: {
  verdict?: string
  hold?: boolean
  timeoutMs?: number
  disk?: string
  resume?: boolean
  enabled?: boolean
  maxInputBytes?: number
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'w1-goal-review-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  const modules = new Map<string, unknown>([
    ['llm', LlmRuntime], ['sessions', SessionStore], ['projections', SessionProjectionRegistry],
    ['agents', AgentRegistry], ['loop', AgentLoop], ['prompt', SystemPrompt], ['tools', ToolRuntime],
    ['goals', GoalService], ['goal-tools', toolGoal], ['review', review], ['persistence', JsonlPersistence],
  ])
  const file = join(directory, 'cordis.yml')
  await writeFile(file, `${settings.disk === undefined ? '' : `- name: persistence\n  config: { root: ${JSON.stringify(settings.disk)}, compression: none }\n`}- name: llm
- name: sessions
- name: projections
- name: agents
- name: prompt
- name: tools
- name: loop
  config: { agents: [] }
- name: goals
- name: goal-tools
- id: review
  name: review
  config: { enabled: ${settings.enabled !== false}, maxInputBytes: ${settings.maxInputBytes ?? 262144}, maxOutputTokens: 2048, timeoutMs: ${settings.timeoutMs ?? 1000} }
`)
  ctx.baseUrl = pathToFileURL(directory).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (!modules.has(name)) throw new Error(`Unexpected module ${name}`)
    return modules.get(name)
  }, loadCache: new Map(),
  register(): never { throw new Error('Unexpected module hook registration') },
  getOrCreateModuleJob(): never { throw new Error('Unexpected module job creation') },
  resolveSync(): never { throw new Error('Unexpected synchronous resolution') },
  load(): never { throw new Error('Unexpected module load') },
  }
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(file).href } })
  await ctx.loader.await()
  const artifact = join(directory, 'result.txt')
  ctx.tools.register(defineTool({ name: 'write_fixture', description: 'Write the requested test artifact.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value: string) => [{ type: 'text', text: value }] },
    async execute() { await writeFile(artifact, 'verified'); return 'artifact written' },
  }))
  let mainStep = settings.resume === true ? 3 : 0
  let reviews = 0
  let statusDuringReview: string | undefined
  class Adapter extends LlmAdapter {
    requests: GenerateOptions[] = []
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      this.requests.push(options)
      if (options.system === reviewPrompt) {
        reviews++
        statusDuringReview = ctx.goals.get(agent)?.phase
        if (settings.hold) await new Promise<void>((resolve) => {
          if (options.signal?.aborted) resolve()
          else options.signal?.addEventListener('abort', () =>{  resolve() }, { once: true })
        })
        yield { type: 'text-delta', index: 0, text: JSON.stringify({ verdict: settings.verdict ?? 'satisfied', reason: 'Checked the supplied artifact tool result.' }) }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const step = mainStep++
      let name: string; let args: object
      if (step === 0) { name = 'create_goal'; args = { objective: 'Write result.txt with verified contents', max_goal_rounds: 3 } }
      else if (step === 1) { name = 'write_fixture'; args = {} }
      else if (step === 2 || step === 3) {
        const goal = ctx.goals.get(agent)!
        if (goal.phase === 'complete') { yield { type: 'text-delta', index: 0, text: 'done' }; yield { type: 'finish', reason: { kind: 'stop' } }; return }
        name = 'update_goal'; args = { goal_id: goal.id, revision: goal.revision, action: 'complete' }
      } else { yield { type: 'text-delta', index: 0, text: 'Awaiting new evidence.' }; yield { type: 'finish', reason: { kind: 'stop' } }; return }
      const id = ToolCallId(`tool-${step}`)
      yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: JSON.stringify(args) }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    }
  }
  const adapter = new Adapter()
  ctx.llm.registerAdapter(['mock'], adapter)
  const options = { provider: 'mock', model: 'main' }
  const created = settings.resume === true
    ? await ctx.agents.resume({ resumeSessionId: SessionId('review-test'), agentOptions: options })
    : await ctx.agents.create({ sessionId: SessionId('review-test'), agentOptions: options, meta: { cwd: directory } })
  const agent = created.agent
  const send = () => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Write result.txt and verify before completing the goal.' }],
      source: { kind: 'user' } }))
  }
  return { ctx, agent, adapter, artifact, send, count: () => reviews, phase: () => statusDuringReview }
}

describe('W1 goal review through Loader and the real agent loop', () => {
  it('reviews before mutation, preserves exact auxiliary input and keeps review out of main history', async () => {
    const h = await load()
    h.send(); await h.agent.whenIdle()
    expect(await readFile(h.artifact, 'utf8')).toBe('verified')
    expect(h.phase()).toBe('active')
    expect(h.ctx.goals.get(h.agent)?.phase).toBe('complete')
    expect(h.count()).toBe(1)
    const request = h.agent.session.snapshotEvents().find(event => event.type === 'w1/goal-review-request')
    expect(request?.type === 'w1/goal-review-request' && request.data.messages).toEqual(h.adapter.requests.find(item => item.system === reviewPrompt)?.messages)
    expect(h.adapter.requests.find(item => item.system === reviewPrompt)?.tools).toEqual([])
    expect(JSON.stringify(h.agent.session.deriveMessages())).not.toContain(reviewPrompt)
  })
  it.each(['needs-work', 'insufficient-evidence', 'invalid'])('rejects %s and deduplicates repeated proposals', async (verdict) => {
    const h = await load({ verdict })
    h.send(); await h.agent.whenIdle()
    expect(h.ctx.goals.get(h.agent)?.phase).toBe('active')
    expect(h.count()).toBe(1)
    expect(h.ctx.goals.get(h.agent)?.activation).toBe('disarmed')
    expect(JSON.stringify(h.agent.session.deriveMessages())).toContain('Completion review')
  })
  it('cancels a pending review when the goal changes and never applies its late success', async () => {
    const h = await load({ hold: true })
    h.send()
    await vi.waitFor(() =>{  expect(h.count()).toBe(1) })
    const goal = h.ctx.goals.get(h.agent)!
    h.ctx.goals.pause(h.agent, goal)
    await h.agent.whenIdle()
    expect(h.ctx.goals.get(h.agent)?.phase).toBe('paused')
    expect(h.adapter.requests.find(item => item.system === reviewPrompt)?.signal?.aborted).toBe(true)
  })
  it('times out without marking the goal blocked or complete', async () => {
    const h = await load({ hold: true, timeoutMs: 30 })
    h.send(); await h.agent.whenIdle()
    expect(h.ctx.goals.get(h.agent)?.phase).toBe('active')
    expect(h.ctx.goals.get(h.agent)?.activation).toBe('disarmed')
    expect(h.count()).toBe(1)
  })
  it('bounds retained evidence and refuses oversized input before a paid review', async () => {
    const h = await load({ maxInputBytes: 128 })
    h.send(); await h.agent.whenIdle()
    expect(h.count()).toBe(0)
    expect(h.ctx.goals.get(h.agent)?.phase).toBe('active')
    const state = h.ctx.sessionProjections.stateOf(h.agent.session, 'w1GoalReview')!
    expect(state.overflow).toBe(true)
    expect(state.bytes).toBeLessThanOrEqual(128)
    expect(state.view?.status).toBe('insufficient-evidence')
  })
  it('does not disarm a replacement goal when the superseded review settles', async () => {
    const h = await load({ hold: true })
    h.send()
    await vi.waitFor(() =>{  expect(h.count()).toBe(1) })
    const old = h.ctx.goals.get(h.agent)!
    h.ctx.goals.clear(h.agent, old)
    const replacement = h.ctx.goals.create(h.agent, { objective: 'Different human objective', maxGoalRounds: 3 })
    h.agent.cancel({ kind: 'user' })
    await h.agent.whenIdle()
    expect(h.ctx.goals.get(h.agent)?.id).toBe(replacement.id)
    expect(h.ctx.goals.get(h.agent)?.phase).toBe('active')
    expect(h.ctx.goals.get(h.agent)?.activation).toBe('armed')
  })
  it('does not buy a review when restoring the Host and its JSONL session', async () => {
    const disk = await mkdtemp(join(tmpdir(), 'w1-goal-durable-'))
    onTestFinished(() => rm(disk, { recursive: true, force: true }))
    const first = await load({ disk, verdict: 'insufficient-evidence' })
    first.send(); await first.agent.whenIdle(); await first.ctx.get('sessionPersistence')!.flush()
    const saved = first.ctx.sessionProjections.snapshot(first.agent.session).values.w1GoalReview
    await first.ctx.fiber.dispose()
    const second = await load({ disk, resume: true })
    await second.agent.whenIdle()
    expect(second.count()).toBe(0)
    expect(second.ctx.sessionProjections.snapshot(second.agent.session).values.w1GoalReview).toEqual(saved)
  })
  it('retains upstream completion behavior when disabled and removes contributions on unload', async () => {
    const h = await load({ enabled: false })
    h.send(); await h.agent.whenIdle()
    expect(h.ctx.goals.get(h.agent)?.phase).toBe('complete')
    expect(h.count()).toBe(0)
    const entry = [...h.ctx.loader.entries()].find(item => item.options.name === 'review')!
    await entry.fiber!.dispose()
    expect(h.ctx.sessionProjections.snapshot(h.agent.session).values.w1GoalReview).toBeUndefined()
  })
})
