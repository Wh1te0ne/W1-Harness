/** Output progress from the current Turn's materialized assistant steps. */
import { estimateContent } from '@deepseek-ai/dsh-token-meter/estimate'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { AssistantChatData } from '../contract/chat-nodes.ts'

/** A display reading, separate from exact prompt-plus-output billing. */
export interface LiveOutput {
  readonly tokens: number
  readonly estimated: boolean
}

/**
 * Sum reported output or text estimates without counting prompt or tool results.
 * @param assistants - Only the current Turn's assistant steps, including streaming data.
 * @returns Generated-output progress; provider samples replace estimates and may correct them downward.
 */
export function liveOutput(assistants: readonly AssistantChatData[] | undefined): LiveOutput {
  let tokens = 0
  let estimated = false
  for (const assistant of assistants ?? []) {
    const usage = assistant.usage
    const output = typeof usage === 'object' && usage !== null && 'outputTokens' in usage ? usage.outputTokens : undefined
    const reported = typeof output === 'number' && Number.isSafeInteger(output) && output >= 0 ? output : undefined
    if (assistant.status !== 'running' && reported !== undefined) {
      tokens += reported
      continue
    }
    const content: ContentBlock[] = []
    for (const block of assistant.blocks) {
      if ((block.kind === 'text' || block.kind === 'reasoning') && block.text !== '') {
        content.push({ type: block.kind, text: block.text })
      } else if (block.kind === 'tool-call' && (block.name !== '' || block.argsRaw !== '')) {
        content.push({ type: 'tool-call', id: ToolCallId(block.callId), name: block.name, arguments: block.argsRaw })
      }
    }
    const estimate = estimateContent(content)
    tokens += Math.max(reported ?? 0, estimate)
    if (estimate > (reported ?? 0)) estimated = true
  }
  return { tokens, estimated }
}
