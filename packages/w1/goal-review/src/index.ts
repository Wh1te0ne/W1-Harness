/** Tool-free completion review, mounted only by W1. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm/brand'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-tool-goal'
import type {} from '@deepseek-ai/dsh-session-projection'
import { deadline, MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { reviewEvidence, reviewPrompt } from './evidence.ts'
import { reviewProjection } from './projection.ts'
import type { GoalReviewView } from './types.ts'
export type {} from './types.ts'

export const name = 'w1-goal-review'
export const inject = ['agents', 'goals', 'llm', 'sessionProjections']
/** Deployment-owned review switch and complete-request limits. */
export interface Config {
  /** Enable the W1 completion policy; disabled keeps upstream tool behavior. */
  readonly enabled: boolean
  /** Maximum UTF-8 bytes in the complete auxiliary request record. */
  readonly maxInputBytes: number
  /** Maximum review completion tokens. */
  readonly maxOutputTokens: number
  /** Deadline for one review, including model preparation. */
  readonly timeoutMs: number
}
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  maxInputBytes: z.number().step(1).min(1).required(),
  maxOutputTokens: z.number().step(1).min(1).required(),
  timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).required(),
})
const verdictSchema = schema.object({ verdict: schema.enum(['satisfied', 'needs-work', 'insufficient-evidence']), reason: schema.string().min(1).max(2000) }).strict()

/**
 * Register the completion policy and durable UI projection.
 * @param ctx - owning W1 plugin context.
 * @param config - validated review limits.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.sessionProjections.register(reviewProjection(config.maxInputBytes))
  if (!config.enabled) return
  const active = new Map<Agent, { controller: AbortController; done: Promise<void> }>()
  ctx.effect(() => async () => {
    for (const operation of active.values()) operation.controller.abort()
    await Promise.allSettled([...active.values()].map(operation => operation.done))
  })
  ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    if (message.source.kind === 'user') active.get(agent)?.controller.abort()
  }, { global: true })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'goal/change') return
    for (const [agent, operation] of active) {
      if (agent.session === session) operation.controller.abort()
    }
  })
  ctx.on('agent/created', async ({ agent }) => {
    const state = ctx.sessionProjections.stateOf(agent.session, 'w1GoalReview')?.view
    if (state?.status === 'reviewing' && !active.has(agent)) {
      agent.session.append('w1/goal-review-result', { ...state, status: 'runtime-error', reason: 'Review interrupted by Host restart; completion was not accepted.' })
      await ctx.get('sessionPersistence')?.flush()
    }
  }, { global: true })
  ctx.on('goal/before-model-complete', async ({ agent, goal, signal }, next) => {
    const downstream = await next()
    if (downstream.kind === 'deny') return downstream
    if (goal.phase !== 'active') return { kind: 'deny', reason: 'Resume the goal before proposing completion.' }
    const session = agent.session
    const state = ctx.sessionProjections.stateOf(session, 'w1GoalReview')
    if (state === undefined) throw new Error('Goal review evidence projection is unavailable')
    const cut = Number(session.seq)
    const evidence = reviewEvidence(state, goal, cut)
    if (state.view?.key === evidence.key) {
      if (state.view.status === 'satisfied') return { kind: 'allow' }
      ctx.goals.disarm(agent)
      return { kind: 'deny', reason: state.view.status !== 'reviewing'
        ? `Completion review: ${state.view.status}. ${state.view.reason}`
        : 'Completion review was interrupted. Provide new evidence before retrying.' }
    }
    const controller = new AbortController()
    let settle = () => {}
    const done = new Promise<void>((resolve) => { settle = resolve })
    active.set(agent, { controller, done })
    try {
      const base = { goalId: goal.id, revision: goal.revision, key: evidence.key }
      session.append('w1/goal-review-attempt', { ...base, cut, status: 'reviewing', reason: '' })
      let result: GoalReviewView
      try {
        await ctx.get('sessionPersistence')?.flush()
        if (!evidence.fits) {
          result = { ...base, status: 'insufficient-evidence', reason: 'The complete evidence exceeds the review input limit. Narrow or revise the goal before retrying.' }
        } else {
          using timer = deadline(AbortSignal.any([signal, controller.signal]), config.timeoutMs, 'W1_GOAL_REVIEW_TIMEOUT')
          const route = state.route
          if (route === null) throw new Error('Missing main request route')
          const call = await ctx.llm.prepareCall({ provider: route.provider, model: route.model,
            ...route.reasoningEffort === null ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) },
            maxTokens: config.maxOutputTokens }, timer.signal)
          const messages = [createUserMessage({ content: [{ type: 'text', text: evidence.input }], source: { kind: 'user' } })]
          if (Buffer.byteLength(JSON.stringify({ system: reviewPrompt, messages, config: call.config }), 'utf8') > config.maxInputBytes) {
            throw new HarnessError('The complete review request exceeds the configured byte limit.', 'W1_REVIEW_INPUT_LIMIT')
          }
          session.append('w1/goal-review-request', { key: evidence.key, system: reviewPrompt, messages, config: call.config })
          await ctx.get('sessionPersistence')?.flush()
          timer.signal.throwIfAborted()
          const assembler = new BlockAssembler()
          const stream = call.stream({ ...call.config, system: reviewPrompt, messages, tools: [],
            sessionId: session.id, signal: timer.signal })
          for await (const chunk of stream) {
            timer.signal.throwIfAborted()
            assembler.push(chunk)
          }
          timer.signal.throwIfAborted()
          if (assembler.finish.kind !== 'stop' || assembler.blocks().some(block => block.type === 'tool-call')) throw new Error('Invalid review response')
          const text = assembler.blocks().filter(block => block.type === 'text').map(block => block.text).join('')
          const verdict = verdictSchema.parse(JSON.parse(text))
          result = { ...base, status: verdict.verdict, reason: verdict.reason }
        }
      } catch (error) {
        const overLimit = error instanceof HarnessError && error.code === 'W1_REVIEW_INPUT_LIMIT'
        result = { ...base, status: overLimit ? 'insufficient-evidence' : 'runtime-error',
          reason: overLimit ? error.message : signal.aborted || controller.signal.aborted
            ? 'Review cancelled; goal completion was not accepted.'
            : 'Review unavailable or invalid; supply new evidence or revise the goal before retrying.' }
      }
      const current = ctx.goals.get(agent)
      const latestEvidence = ctx.sessionProjections.stateOf(session, 'w1GoalReview')
      if (signal.aborted || controller.signal.aborted || current?.id !== goal.id || current.revision !== goal.revision
        || latestEvidence === undefined || reviewEvidence(latestEvidence, goal, Number(session.seq)).key !== evidence.key) {
        result = { ...base, status: 'runtime-error', reason: 'Review superseded; the goal or its evidence changed.' }
      }
      session.append('w1/goal-review-result', result)
      await ctx.get('sessionPersistence')?.flush()
      if (result.status === 'satisfied') return { kind: 'allow' }
      const latest = ctx.goals.get(agent)
      if ((result.status === 'runtime-error' || result.status === 'insufficient-evidence')
        && latest?.id === goal.id && latest.revision === goal.revision) ctx.goals.disarm(agent)
      return { kind: 'deny', reason: `Completion review: ${result.status}. ${result.reason}` }
    } finally {
      if (active.get(agent)?.controller === controller) active.delete(agent)
      settle()
    }
  })
}
