/** Observe main-loop structure and cache counters without changing requests or streams. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { RequestStructure } from '@deepseek-ai/dsh-llm-deepseek'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { changes, normalizedStructure } from './compare.ts'
import type { CacheDiagnostic } from './types.ts'
export type {} from './types.ts'

export const name = 'w1-cache-diagnostics'
export const inject = ['sessions', 'sessionProjections', 'llm']
/** Bounds for retained digest baselines and the diagnostic projection. */
export interface Config {
  /** Enable passive request observations. */
  readonly enabled: boolean
  /** Maximum sessions retaining in-memory baselines. */
  readonly maxSessions: number
  /** Maximum model/effort routes retained per session. */
  readonly maxRoutes: number
  /** Maximum message digests per baseline; larger prefixes become unclassified. */
  readonly maxMessages: number
  /** Maximum report rows retained in each session projection. */
  readonly maxReports: number
}
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false), maxSessions: z.number().step(1).min(1).required(),
  maxRoutes: z.number().step(1).min(1).required(), maxMessages: z.number().step(1).min(1).required(),
  maxReports: z.number().step(1).min(1).required(),
})
const diagnosticSchema: schema.ZodType<CacheDiagnostic> = schema.object({
  turn: schema.number(), step: schema.number(), provider: schema.string(), model: schema.string(),
  channel: schema.enum(['normalized', 'deepseek-wire']),
  status: schema.enum(['cold', 'stable', 'expected-rebuild', 'suspected-miss', 'unknown']),
  causes: schema.array(schema.enum(['route', 'system', 'tools', 'settings', 'messages', 'comparison-limit'])),
  inputTokens: schema.number().optional(), cacheReadTokens: schema.number().optional(), cacheWriteTokens: schema.number().optional(),
  observedInputTokens: schema.number().optional(), messageCount: schema.number(), requestBytes: schema.number(),
})
interface Baseline { normalized: RequestStructure; wire?: RequestStructure }
interface Observation { options: GenerateOptions; wire?: RequestStructure }

/**
 * Observe main-loop calls and publish content-free diagnostics outside model history.
 * @param ctx - LLM stream and session projection owner.
 * @param config - validated observation bounds.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.sessionProjections.register({ key: 'w1CacheDiagnostics', stateVersion: 1, stateSchema: schema.array(diagnosticSchema), init: () => [],
    apply: (state, event) => event.type === 'w1/cache-diagnostic' ? [...state, event.data].slice(-config.maxReports) : state,
    wire: { viewSchema: schema.array(diagnosticSchema), view: state => state },
  })
  if (!config.enabled) return
  ctx.sessionProjections.register({ key: 'w1CachePosition', stateVersion: 1,
    stateSchema: schema.object({ turn: schema.number(), step: schema.number() }), init: () => ({ turn: 0, step: 0 }),
    apply: (state, event) => event.type === 'step/start' ? { turn: event.data.turn, step: event.data.step } : state,
  })
  const baselines = new Map<Session, { lastRoute: string; routes: Map<string, Baseline> }>()
  const active = new Map<Session, Observation>()
  ctx.on('session/disposed', (session) => { baselines.delete(session); active.delete(session) })
  ctx.on('llm-deepseek/request-prepared', (detail) => {
    const session = detail.options.sessionId === undefined ? undefined : ctx.sessions.get(detail.options.sessionId)
    const observation = session === undefined ? undefined : active.get(session)
    if (observation !== undefined && observation.options.signal === detail.options.signal
      && observation.options.provider === detail.options.provider && observation.options.model === detail.options.model) {
      observation.wire = detail.summarize(config.maxMessages)
    }
  })
  ctx.on('llm/stream', async function* (options, next) {
    const session = options.sessionId === undefined ? undefined : ctx.sessions.get(options.sessionId)
    if (!isAgentLoopRequest(options) || session === undefined) { yield* next(); return }
    let normalized: RequestStructure
    try { normalized = normalizedStructure(options, config.maxMessages) }
    catch { yield* next(); return }
    const observation: Observation = { options }
    active.set(session, observation)
    const route = JSON.stringify([options.provider, options.model, options.reasoningEffort ?? null])
    const history = baselines.get(session)
    const previous = history?.routes.get(route)
    let usage: TokenUsage | undefined
    let stopped = false
    try {
      for await (const chunk of next()) {
        if (chunk.type === 'usage') usage = chunk.usage
        if (chunk.type === 'finish') stopped = chunk.reason.kind !== 'error'
        yield chunk
      }
    } finally {
      if (active.get(session) === observation) active.delete(session)
      try {
        const wire = observation.wire
        const prior = wire === undefined ? previous?.normalized : previous?.wire
        const current = wire ?? normalized
        const causes = [...history !== undefined && history.lastRoute !== route ? ['route' as const] : [], ...changes(prior, current)]
        const status: CacheDiagnostic['status'] = !stopped || usage?.cacheReadTokens === undefined || causes.includes('comparison-limit') ? 'unknown'
          : causes.length > 0 ? 'expected-rebuild' : prior === undefined ? 'cold'
            : usage.cacheReadTokens === 0 && usage.inputTokens > 0 ? 'suspected-miss' : 'stable'
        const position = ctx.sessionProjections.stateOf(session, 'w1CachePosition')
        const report: CacheDiagnostic = {
          turn: position?.turn ?? 0, step: position?.step ?? 0,
          provider: options.provider, model: options.model, channel: wire === undefined ? 'normalized' : 'deepseek-wire', status, causes,
          messageCount: current.messageCount, requestBytes: current.payloadBytes,
          ...usage === undefined ? {} : { inputTokens: usage.inputTokens,
            ...usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens },
            ...usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens },
            ...usage.cacheReadTokens === undefined || usage.cacheWriteTokens === undefined ? {} : {
              observedInputTokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
            },
          },
        }
        session.append('w1/cache-diagnostic', report)
        if (stopped) {
          const routes = history?.routes ?? new Map<string, Baseline>()
          routes.delete(route); routes.set(route, { normalized, ...wire === undefined ? {} : { wire } })
          while (routes.size > config.maxRoutes) {
            const oldest = routes.keys().next().value
            if (oldest === undefined) break
            routes.delete(oldest)
          }
          baselines.delete(session); baselines.set(session, { lastRoute: route, routes })
          while (baselines.size > config.maxSessions) {
            const oldest = baselines.keys().next().value
            if (oldest === undefined) break
            baselines.delete(oldest)
          }
        }
      } catch { ctx.logger.warn('W1 cache diagnostics unavailable; the model stream is unchanged.') }
    }
  })
}
