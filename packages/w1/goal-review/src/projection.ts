/** Incremental, bounded current-goal evidence; no synchronous historical reads. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { GoalReviewState, ReviewEvidenceItem } from './types.ts'

export const viewSchema = z.object({ goalId: z.string(), revision: z.number(), key: z.string(),
  status: z.enum(['reviewing', 'satisfied', 'needs-work', 'insufficient-evidence', 'runtime-error']), reason: z.string() })
const itemSchema = z.object({ seq: z.number(), type: z.string(), data: z.string() })
const digest = (previous: string, item: ReviewEvidenceItem) => createHash('sha256').update(previous).update(JSON.stringify(item)).digest('hex')

export function reviewProjection(maxBytes: number): ProjectionDefinition<'w1GoalReview'> & {
  wire: NonNullable<ProjectionDefinition<'w1GoalReview'>['wire']>
} {
  const fresh = (): GoalReviewState => ({ view: null, goalId: null, lastHuman: null, lastHumanOverflow: false,
    evidence: [], answers: [], evidenceHash: '', answerHash: '', hasToolResult: false, bytes: 0, overflow: false, pendingGoalCalls: [], route: null })
  const retain = (state: GoalReviewState, item: ReviewEvidenceItem, answer = false): GoalReviewState => {
    const bytes = Buffer.byteLength(JSON.stringify(item), 'utf8')
    const overflow = state.overflow || state.bytes + bytes > maxBytes
    return { ...state, overflow, bytes: Math.min(maxBytes, state.bytes + bytes),
      ...answer ? { answers: overflow ? state.answers : [...state.answers, item], answerHash: digest(state.answerHash, item) }
        : { evidence: overflow ? state.evidence : [...state.evidence, item], evidenceHash: digest(state.evidenceHash, item) },
    }
  }
  return {
    key: 'w1GoalReview', stateVersion: 2,
    stateSchema: z.object({ view: viewSchema.nullable(), goalId: z.string().nullable(), lastHuman: itemSchema.nullable(),
      lastHumanOverflow: z.boolean(), evidence: z.array(itemSchema), answers: z.array(itemSchema),
      evidenceHash: z.string(), answerHash: z.string(),
      hasToolResult: z.boolean(), bytes: z.number(), overflow: z.boolean(), pendingGoalCalls: z.array(z.string()),
      route: z.object({ provider: z.string(), model: z.string(), reasoningEffort: z.string().nullable() }).nullable(),
    }),
    init: fresh,
    apply(state, event) {
      if (event.type === 'turn/start') return { ...state, lastHuman: null, lastHumanOverflow: false, pendingGoalCalls: [] }
      if (event.type === 'request/header') {
        const route = event.data.header.config
        return { ...state, route: { provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort ?? null } }
      }
      if (event.type === 'w1/goal-review-attempt' || event.type === 'w1/goal-review-result') return { ...state, view: event.data }
      if (event.type === 'goal/change') {
        if (event.data.operation === 'clear') return { ...fresh(), lastHuman: state.lastHuman,
          lastHumanOverflow: state.lastHumanOverflow, route: state.route, pendingGoalCalls: state.pendingGoalCalls }
        if (event.data.operation !== 'create') return { ...state, view: null }
        const initial = { ...fresh(), goalId: event.data.goal.id, lastHuman: state.lastHuman, lastHumanOverflow: state.lastHumanOverflow,
          route: state.route, pendingGoalCalls: state.pendingGoalCalls, overflow: state.lastHumanOverflow }
        return initial.lastHuman === null ? initial : retain(initial, initial.lastHuman)
      }
      if (event.type === 'user/message' && event.data.source.kind === 'user') {
        const item = { seq: Number(event.seq), type: event.type, data: JSON.stringify(event.data) }
        const human = state.lastHuman === null ? item : { seq: state.lastHuman.seq, type: 'user/messages',
          data: `${state.lastHuman.data}\n${item.data}` }
        const overflow = state.lastHumanOverflow || Buffer.byteLength(JSON.stringify(human), 'utf8') > maxBytes
        const next = { ...state, lastHuman: overflow ? null : human, lastHumanOverflow: overflow }
        return state.goalId === null ? next : retain(next, item)
      }
      if (event.type === 'tool/call' && ['get_goal', 'create_goal', 'update_goal'].includes(event.data.name)) {
        return { ...state, pendingGoalCalls: [...state.pendingGoalCalls, event.data.callId] }
      }
      if (event.type === 'tool/result' && state.pendingGoalCalls.includes(event.data.message.toolCallId)) {
        return { ...state, pendingGoalCalls: state.pendingGoalCalls.filter(id => id !== event.data.message.toolCallId) }
      }
      if (state.goalId === null) return state
      if (event.type === 'tool/call' || event.type === 'tool/result') {
        const item = { seq: Number(event.seq), type: event.type, data: JSON.stringify(event.data) }
        return retain({ ...state, hasToolResult: state.hasToolResult || event.type === 'tool/result' }, item)
      }
      if (event.type === 'assistant/message' && event.data.interrupted !== true) {
        const text = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
        return text === '' ? state : retain(state, { seq: Number(event.seq), type: 'assistant-text', data: text }, true)
      }
      return state
    },
    wire: { viewSchema: viewSchema.nullable(), view: state => state.view },
  }
}
