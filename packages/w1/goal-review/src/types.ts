/** Durable auxiliary review records; none are conversation messages. */
import type { LlmCallConfig, Message } from '@deepseek-ai/dsh-llm'

/**
 * Bounded objective and progress evidence supplied to the completion reviewer.
 */
export interface GoalReviewView {
  readonly goalId: string
  readonly revision: number
  readonly key: string
  readonly status: 'reviewing' | 'satisfied' | 'needs-work' | 'insufficient-evidence' | 'runtime-error'
  readonly reason: string
}

/** Bounded event evidence, separate from the client-visible review verdict. */
export interface ReviewEvidenceItem { readonly seq: number; readonly type: string; readonly data: string }
/**
 * Projected completion-review state retained with its owning goal.
 */
export interface GoalReviewState {
  readonly view: GoalReviewView | null
  readonly goalId: string | null
  readonly lastHuman: ReviewEvidenceItem | null
  readonly lastHumanOverflow: boolean
  readonly evidence: ReviewEvidenceItem[]
  readonly answers: ReviewEvidenceItem[]
  readonly evidenceHash: string
  readonly answerHash: string
  readonly hasToolResult: boolean
  readonly bytes: number
  readonly overflow: boolean
  readonly pendingGoalCalls: string[]
  readonly route: { readonly provider: string; readonly model: string; readonly reasoningEffort: string | null } | null
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Claims one completion review for an exact goal revision and evidence hash before dispatch. */
    'w1/goal-review-attempt': GoalReviewView & { readonly cut: number }
    /** Exact tool-free auxiliary request; retained for reconstruction outside the conversation surface. */
    'w1/goal-review-request': {
      readonly key: string
      readonly system: string
      readonly messages: Message[]
      readonly config: LlmCallConfig
    }
    /** Review verdict or runtime failure; absence after an attempt means interrupted, never satisfied. */
    'w1/goal-review-result': GoalReviewView
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { w1GoalReview: GoalReviewState }
  interface SessionProjectionMap { w1GoalReview: GoalReviewView | null }
}
