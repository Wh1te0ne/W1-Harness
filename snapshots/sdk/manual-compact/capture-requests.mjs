/** Capture the isolated scenario's model inputs before adapter execution. */
import { appendFileSync } from 'node:fs'

/**
 * @param ctx - Scenario context providing the LLM event stream.
 * @param config - Output path under the private DSH home and optional expected replay provider/model.
 */
export function apply(ctx, config) {
  ctx.on('llm/stream', async function* (options, next) {
    if (config.expectedProvider !== undefined && options.provider !== config.expectedProvider
      || config.expectedModel !== undefined && options.model !== config.expectedModel) {
      throw new Error(`Snapshot request escaped its replay route: ${options.provider}/${options.model}`)
    }
    appendFileSync(config.path, JSON.stringify({
      provider: options.provider,
      model: options.model,
      purpose: options.purpose,
      maxTokens: options.maxTokens,
      reasoningEffort: options.reasoningEffort,
      messages: options.messages,
      tools: options.tools,
    }) + '\n')
    yield* next()
  })
}
