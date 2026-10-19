/** Exercise the shipped daily-use policy through its real overlay and Loader. */
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { Config } from '../../../client/hmr/src/index.ts'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs() })
it.each([
  { home: 'test-w1-home', hot: undefined, expected: false },
  { home: 'test-w1-home', hot: '1', expected: true },
  { home: undefined, hot: undefined, expected: true },
])('resolves W1 daily reload policy: $home / $hot', async ({ home, hot, expected }) => {
  vi.stubEnv('W1_HOME', home)
  vi.stubEnv('W1_CLIENT_HOT_RELOAD', hot)
  const rows = loadOverlayPatches('w1-reload-policy', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))
    .flatMap(patch => patch.insert ?? []).filter(row => row.id === 'client-hmr')
  expect(rows).toHaveLength(1)
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader).await()
  let watchBundles: boolean | undefined
  ctx.loader.builtins.policy = { Config, apply: (_ctx: Context, config: Config) => { watchBundles = config.watchBundles } }
  await ctx.loader.root.update([{ ...rows[0]!, name: 'cordis:policy' }])
  await ctx.loader.await()
  expect(watchBundles).toBe(expected)
})
