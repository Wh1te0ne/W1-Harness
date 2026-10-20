/** Content-free fingerprints of the actual serialized Messages request. */
import { createHash } from 'node:crypto'

/**
 * Content-free digests and bounds for one serialized Messages request.
 */
export interface RequestStructure {
  readonly systemHash: string
  readonly toolsHash: string
  readonly settingsHash: string
  readonly messagesHash: string
  readonly messageDigests: readonly string[]
  readonly messageCount: number
  readonly payloadBytes: number
  readonly bounded: boolean
}
const hash = (value: unknown) => createHash('sha256').update(value === undefined ? 'null' : JSON.stringify(value)).digest('hex')

/**
 * Hash only model-input fields; callers choose the retained message-count bound.
 * @param payload - Serialized Messages request after provider projection.
 * @param maxMessages - Maximum number of per-message fingerprints retained.
 * @returns Content-free structural fingerprints and payload bounds.
 */
export function requestStructure(payload: string, maxMessages: number): RequestStructure {
  if (!Number.isSafeInteger(maxMessages) || maxMessages < 1) throw new TypeError('maxMessages must be a positive integer')
  const parsed: unknown = JSON.parse(payload)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('Expected a Messages object')
  const body = parsed as Record<string, unknown>
  const messages = Array.isArray(body.messages) ? body.messages : []
  return {
    systemHash: hash(body.system), toolsHash: hash(body.tools),
    settingsHash: hash([body.model, body.thinking, body.output_config, body.temperature,
      body.top_p, body.stop_sequences, body.tool_choice]),
    messagesHash: hash(messages), messageDigests: messages.slice(0, maxMessages).map(hash), messageCount: messages.length,
    payloadBytes: Buffer.byteLength(payload, 'utf8'), bounded: messages.length > maxMessages,
  }
}
