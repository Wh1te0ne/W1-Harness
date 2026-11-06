import { expect, it, onTestFinished, vi } from 'vitest'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { resolveProfiles } from '../../../llm/llm-pi-ai/src/config.ts'
import { memoryAuth } from '../../../llm/llm-pi-ai/tests/auth-double.ts'
import { closeMockServers, mockServer } from '../../../llm/llm-pi-ai/tests/mock-server.ts'
import { reviewFixture } from './transport-fixture.ts'

function response(text: string, finish = 'stop') {
  return { events: [
    JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'Synthetic reasoning.' } }] }),
    JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] }),
    JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 20, completion_tokens: 10 } }),
    '[DONE]',
  ] }
}

it('runs real HTTP reviews outside conversation rewriting and fails closed on deny, malformed, empty and truncated responses', async () => {
  const fixture = await reviewFixture({ requestTransportByPurpose: { 'auto-review': { isolated: true, headers: { 'x-utility': '1' } } } })
  onTestFinished(async () => { await fixture.ctx.fiber.dispose(); await closeMockServers() })
  const upstream = await mockServer([
    response('{"risk":"low","decision":"allow"}'),
    response('{"risk":"high","decision":"deny"}'),
    response('❌ proxy error'), response(''), response('{"risk":"low","decision":"allow"}', 'length'),
  ])
  const adapter = new PiAiAdapter({
    profiles: () => resolveProfiles({ arbitrary: { api: 'openai-completions', baseURL: upstream.url, models: [{ id: 'arbitrary-model', maxTokens: 8192, compat: { supportsDeveloperRole: false } }] } }),
    resolveApiKey: () => Promise.resolve('synthetic-key'), auth: memoryAuth(),
  })
  fixture.ctx.llm.registerAdapter(['arbitrary'], adapter)
  const interceptor = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('conversation rewrite path'))
  onTestFinished(() => { interceptor.mockRestore() })
  expect((await fixture.execute('arbitrary', 'arbitrary-model')).isError).toBe(false)
  for (let i = 0; i < 4; i++) expect((await fixture.execute('arbitrary', 'arbitrary-model')).isError).toBe(true)
  expect(fixture.runs()).toBe(1)
  expect(interceptor).not.toHaveBeenCalled()
  expect(upstream.requests).toHaveLength(5)
  for (const [i, request] of upstream.requests.entries()) {
    expect(upstream.headers[i]?.['x-utility']).toBe('1')
    expect(request).toMatchObject({ model: 'arbitrary-model' })
    const body = request as Record<string, unknown>
    expect(body.max_tokens ?? body.max_completion_tokens).toBe(8192)
    expect(JSON.stringify(request)).toContain('REVIEW_POLICY')
    expect(request).not.toHaveProperty('temperature')
  }
})
