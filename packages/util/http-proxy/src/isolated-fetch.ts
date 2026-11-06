/**
 * Send through the host's undici dispatcher without global fetch wrappers.
 * This keeps one-shot machine responses outside conversation rewriting while
 * retaining the launcher's proxy policy, cancellation and streaming semantics.
 * @param input - the URL or request to send.
 * @param init - standard fetch options.
 * @returns the unmodified HTTP response.
 */
export const isolatedFetch: typeof fetch = async (input, init) => {
  const { fetch: send, Request: HttpRequest } = await import('undici')
  // Undici and Node expose distinct Request classes. Preserve a caller's
  // streaming body and signal rather than serializing or buffering them.
  const request = input instanceof Request ? new HttpRequest(input.url, {
    method: input.method, headers: Object.fromEntries(input.headers), signal: input.signal,
    redirect: input.redirect, credentials: input.credentials,
    ...(input.body === null ? {} : { body: input.body, duplex: 'half' }),
  }) : input
  return await send(request, init as Parameters<typeof send>[1]) as unknown as Response
}
