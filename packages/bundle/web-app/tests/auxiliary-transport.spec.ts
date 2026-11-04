import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import LlmRuntime, { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { expect, it, onTestFinished } from 'vitest'

it('loads shipped auxiliary transport policy without classifying conversations, side-chat or compaction as utilities', async () => {
  const patches = loadOverlayPatches('utility-routing', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))).filter(p => p.id === 'llm')
  const rows = applyEntryPatches([{ id: 'llm', name: 'cordis:llm' }], patches, (message) => { throw Error(message) })
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader)
  ctx.loader.builtins.llm = LlmRuntime
  await ctx.loader.root.update(rows)
  await ctx.loader.await()
  const requests: GenerateOptions[] = []
  class Adapter extends LlmAdapter {
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['arbitrary'], new Adapter())
  for (const purpose of ['auto-review', 'goal-review', 'session-title', 'reply-selection', 'reply-suggestion', 'side-chat', 'compaction', undefined] as const) {
    for await (const _chunk of ctx.llm.stream({ provider: 'arbitrary', model: 'arbitrary', messages: [], ...purpose === undefined ? {} : { purpose } })) { /* drain */ }
  }
  expect(requests.slice(0, 5).every(r => r.transport?.isolated === true && r.transport.headers?.['x-bili-passthrough'] === '1')).toBe(true)
  expect(requests.slice(5).every(r => r.transport === undefined)).toBe(true)
})
