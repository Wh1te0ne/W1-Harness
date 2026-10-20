/** Request comparisons retain digests rather than prompt or tool content. */
import { createHash } from 'node:crypto'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { RequestStructure } from '@deepseek-ai/dsh-llm-deepseek'
import type { CacheDiagnostic } from './types.ts'
const hash = (value: unknown) => createHash('sha256').update(value === undefined ? 'null' : JSON.stringify(value)).digest('hex')

export function normalizedStructure(options: GenerateOptions, maxMessages: number): RequestStructure {
  const messages = options.messages.map(({ id: _id, source, ...message }) => ({ ...message,
    ...source?.kind === 'model' && 'replayState' in source && source.replayState !== undefined ? { replayState: source.replayState } : {} }))
  return {
    systemHash: hash(options.system), toolsHash: hash(options.tools),
    settingsHash: hash([options.provider, options.model, options.reasoningEffort, options.temperature, options.stop]),
    messagesHash: hash(messages), messageDigests: messages.slice(0, maxMessages).map(hash),
    messageCount: messages.length, bounded: messages.length > maxMessages,
    payloadBytes: Buffer.byteLength(JSON.stringify({ system: options.system, tools: options.tools, messages }), 'utf8'),
  }
}

/** Compare the previous input prefix; appended messages do not count as rewrites. */
export function changes(before: RequestStructure | undefined, after: RequestStructure): CacheDiagnostic['causes'] {
  if (before === undefined) return []
  const causes: CacheDiagnostic['causes'][number][] = []
  if (before.systemHash !== after.systemHash) causes.push('system')
  if (before.toolsHash !== after.toolsHash) causes.push('tools')
  if (before.settingsHash !== after.settingsHash) causes.push('settings')
  if (before.messageCount === after.messageCount && before.messagesHash === after.messagesHash) return causes
  if (before.messageCount > after.messageCount) causes.push('messages')
  else if (before.bounded || after.messageDigests.length < before.messageCount) causes.push('comparison-limit')
  else if (before.messageDigests.some((digest, index) => digest !== after.messageDigests[index])) causes.push('messages')
  return causes
}
