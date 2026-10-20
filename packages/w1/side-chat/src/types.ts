import type { LlmCallConfig, Message, TokenUsage } from '@deepseek-ai/dsh-llm'

/** Independently selectable route; opening uses the parent's selected route. */
export interface SideRoute { readonly provider: string; readonly model: string; readonly reasoningEffort?: string }
/** Opening receipt for a frozen, tool-free side conversation. */
export interface SideOpened { readonly route: SideRoute; readonly contextMessages: number }
/** One streamed side response. */
export type SideFrame = { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'done'; readonly usage?: TokenUsage }

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Exact auxiliary request in a detached, memory-only side Session. */
    'w1/side-request': { readonly system: string; readonly messages: Message[]; readonly config: LlmCallConfig }
    /** Settled side response, including any delivered prefix on cancellation. */
    'w1/side-response': { readonly text: string; readonly status: 'completed' | 'interrupted'; readonly usage?: TokenUsage }
  }
}
