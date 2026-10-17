/** Wire values for optional W1 reply drafts. Suggestions never enter conversation history. */
import type { Message } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'

/** One configured provider/model pair. */
export interface ReplyRoute {
  readonly provider: string
  readonly model: string
}

/** Latest suggestion for a completed turn, absent while the conversation advances. */
export interface ReplySuggestion {
  readonly turn: number
  readonly text: string
  readonly route: ReplyRoute
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    w1ReplySuggestion: ReplySuggestion | null
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** A completed turn has claimed its one automatic suggestion attempt, including an empty or failed outcome. */
    'w1/reply-attempt': { readonly turn: number }
    /** Exact auxiliary input, recorded before dispatch; no conversation surface operation. */
    'w1/reply-request': {
      readonly turn: number
      readonly stage: 'select' | 'suggest'
      readonly route: ReplyRoute
      readonly system: string
      readonly messages: Message[]
      readonly maxTokens: number
      readonly config: LlmCallConfig
    }
    /** Model-selected route cached for the captured main route and allowed-model policy. */
    'w1/reply-route': { readonly key: string; readonly route: ReplyRoute }
    /** Text offered for user acceptance, never automatically submitted. */
    'w1/reply-suggestion': ReplySuggestion
  }
}
