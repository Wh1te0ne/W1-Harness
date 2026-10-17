/** Bounded, incremental context for auxiliary suggestions and their composer projection. */
import { z } from 'zod'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { ReplyRoute, ReplySuggestion } from './types.ts'

interface ReplyContext {
  turn: number
  completedTurn: number | null
  lastAssistantTurn: number | null
  attemptedTurn: number | null
  route: ReplyRoute | null
  messages: { role: 'user' | 'assistant'; text: string }[]
  cached: { key: string; route: ReplyRoute } | null
  suggestion: ReplySuggestion | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    w1ReplySuggestion: ReplyContext
  }
}

const route = z.object({ provider: z.string(), model: z.string() })
const suggestion = z.object({ turn: z.number(), text: z.string(), route })

/** Collect text only; tool results, reasoning, files and images are excluded. */
function textOf(blocks: readonly ContentBlock[]): string {
  return blocks.filter(block => block.type === 'text').map(block => block.text).join('\n')
}

/**
 * Create a fold with an explicit total context bound.
 * @param maxCharacters - maximum UTF-16 characters across retained messages.
 * @param maxMessages - maximum retained user and assistant messages.
 * @returns host fold and composer-only wire view.
 */
export function createReplyProjection(maxCharacters: number, maxMessages: number): ProjectionDefinition<'w1ReplySuggestion'> & {
  wire: NonNullable<ProjectionDefinition<'w1ReplySuggestion'>['wire']>
} {
  return {
    key: 'w1ReplySuggestion', stateVersion: 2,
    stateSchema: z.object({
      turn: z.number(), route: route.nullable(),
      completedTurn: z.number().nullable(), lastAssistantTurn: z.number().nullable(), attemptedTurn: z.number().nullable(),
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })),
      cached: z.object({ key: z.string(), route }).nullable(),
      suggestion: suggestion.nullable(),
    }),
    init: () => ({
      turn: 0, completedTurn: null, lastAssistantTurn: null, attemptedTurn: null,
      route: null, messages: [], cached: null, suggestion: null,
    }),
    apply(state, event) {
      if (event.type === 'turn/start') return { ...state, turn: event.data.turn, completedTurn: null, suggestion: null }
      if (event.type === 'turn/end') return {
        ...state, completedTurn: event.data.reason.kind === 'completed' ? event.data.turn : null,
      }
      if (event.type === 'w1/reply-attempt' || event.type === 'w1/reply-request') {
        return { ...state, attemptedTurn: event.data.turn }
      }
      if (event.type === 'request/header') return { ...state, route: {
        provider: event.data.header.config.provider, model: event.data.header.config.model,
      }, suggestion: null }
      if (event.type === 'w1/reply-route') return { ...state, cached: event.data }
      if (event.type === 'w1/reply-suggestion') {
        return event.data.turn === state.turn
          ? { ...state, attemptedTurn: event.data.turn, suggestion: event.data } : state
      }
      const role = event.type === 'user/message' && event.data.source.kind === 'user' ? 'user'
        : event.type === 'assistant/message' && event.data.interrupted !== true ? 'assistant' : null
      if (role === null) return state
      const text = event.type === 'user/message' ? textOf(event.data.content)
        : event.type === 'assistant/message' ? textOf(event.data.message.content) : ''
      if (text.trim() === '') return state
      const message: ReplyContext['messages'][number] = { role, text }
      const messages = [...state.messages, message].slice(-maxMessages)
      let remaining = maxCharacters
      const bounded: ReplyContext['messages'] = []
      for (const message of messages.toReversed()) {
        if (remaining === 0) break
        const text = message.text.slice(-remaining)
        bounded.unshift({ ...message, text })
        remaining -= text.length
      }
      return {
        ...state, messages: bounded, suggestion: null,
        lastAssistantTurn: event.type === 'assistant/message' ? event.data.turn : state.lastAssistantTurn,
      }
    },
    wire: { viewSchema: suggestion.nullable(), view: state => state.suggestion },
  }
}
