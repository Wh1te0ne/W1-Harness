import type { TokenUsage } from '@deepseek-ai/dsh-llm'

const object = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Request metadata observers and response transport for one model invocation. */
interface BillingCapture {
  onPayload(payload: unknown): void
  decorate(usage: TokenUsage): TokenUsage
  fetch: typeof fetch
}

/**
 * Observe only billing scalars; bytes, stream cancellation and provider errors pass through unchanged.
 * @param fetcher Transport used to send the model request.
 * @returns Payload observer, usage decorator and streaming transport for one invocation.
 */
export function createBillingCapture(fetcher: typeof fetch = globalThis.fetch): BillingCapture {
  let write1h: number | undefined
  let parameters: TokenUsage['billingParameters']
  const observe = (event: unknown) => {
    const row = object(event), raw = object(row.usage ?? object(row.message).usage ?? object(row.response).usage)
    const details = object(raw.prompt_tokens_details ?? raw.input_tokens_details)
    const creation = object(raw.cache_creation ?? details.cache_creation)
    const oneHour = creation.ephemeral_1h_input_tokens ?? details.cache_write_1h_tokens
    if (count(oneHour)) write1h = oneHour
  }
  return {
    onPayload(payload: unknown) {
      const effort = object(object(payload).output_config).effort
      parameters = { outputConfigEffort: typeof effort === 'string' ? effort.slice(0, 64) : null }
    },
    decorate(usage: TokenUsage): TokenUsage {
      return { ...usage, ...parameters ? { billingParameters: parameters } : {},
        ...write1h !== undefined && write1h <= (usage.cacheWriteTokens ?? 0) ? { cacheWrite1hTokens: write1h } : {} }
    },
    fetch: (async (input, init) => {
      const response = await fetcher(input, init)
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) return response
      write1h = undefined
      const decoder = new TextDecoder()
      let buffer = '', dropping = false
      const transform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          controller.enqueue(chunk)
          for (const part of decoder.decode(chunk, { stream: true }).split(/(?<=\n)/)) {
            if (!dropping) buffer += part
            if (buffer.length > 131072) { buffer = ''; dropping = true }
            if (!part.endsWith('\n')) continue
            if (!dropping && buffer.startsWith('data:')) {
              try { observe(JSON.parse(buffer.slice(5).trim())) } catch { /* Non-JSON and terminal frames carry no billing metadata. */ }
            }
            buffer = ''; dropping = false
          }
        },
        flush() {
          buffer += decoder.decode()
          if (!dropping && buffer.startsWith('data:')) {
            try { observe(JSON.parse(buffer.slice(5).trim())) } catch { /* An incomplete final frame has no usable usage. */ }
          }
        },
      })
      return new Response(response.body.pipeThrough(transform), {
        status: response.status, statusText: response.statusText, headers: response.headers,
      })
    }),
  }
}
