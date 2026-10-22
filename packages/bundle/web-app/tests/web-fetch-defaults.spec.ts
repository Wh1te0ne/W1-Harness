/** The shipped desktop policy and explicit strict override, exercised through Loader. */
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import WebRuntime, { WebError } from '@deepseek-ai/dsh-web'
import * as HttpFetch from '@deepseek-ai/dsh-web-fetch-http'
import { publicHttpNetwork } from '../../../web/web-fetch-http/src/network.ts'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'

afterEach(() => { vi.restoreAllMocks() })

it.each([
  { profile: 'desktop', override: undefined, strict: false },
  { profile: 'desktop', override: true, strict: true },
  { profile: 'web', override: undefined, strict: true },
  { profile: 'custom-web', override: undefined, strict: true },
  { profile: undefined, override: undefined, strict: true },
  { profile: 'web', override: false, strict: false },
])('resolves fetch policy for $profile with override $override', async ({ profile, override, strict }) => {
  const patches = loadOverlayPatches('fetch-defaults', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))
    .filter(patch => patch.id === 'web-fetch-http')
  expect(patches).toHaveLength(1)
  const rows = applyEntryPatches([{ id: 'web-fetch-http', name: 'cordis:http-fetch' }], [
    ...patches,
    ...override === undefined ? [] : [{ id: 'web-fetch-http', config: { requirePublicIp: override } }],
  ], (message) => { throw new Error(message) })
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  if (profile !== undefined) ctx.provide('profileContext', {
    name: profile, dir: '/profile', patchPath: '/profile/cordis.patch.yml', installAnchor: '/profile/package.json',
    cwd: '/workspace', home: '/home', startedBundles: [], overlays: [], telemetryDisabledEnv: undefined,
  })
  await ctx.plugin(WebRuntime, { fetchProvider: 'http' })
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader).await()
  ctx.loader.builtins['http-fetch'] = HttpFetch
  const resolve = vi.spyOn(publicHttpNetwork, 'resolve').mockRejectedValue(new WebError('Non-public destination', 'WEB_BLOCKED_URL'))
  const request = vi.spyOn(publicHttpNetwork, 'requestSystem')
    .mockRejectedValue(new WebError('System transport reached', 'WEB_PROVIDER_ERROR'))
  await ctx.loader.root.update(rows)
  await ctx.loader.await()
  if (strict) {
    await expect(ctx.web.fetch({ url: 'http://127.0.0.1/page' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_BLOCKED_URL' }))
    expect(resolve).toHaveBeenCalledOnce()
    expect(request).not.toHaveBeenCalled()
  } else {
    await expect(ctx.web.fetch({ url: 'http://127.0.0.1/page' })).rejects.toThrow('System transport reached')
    expect(request).toHaveBeenCalledOnce()
    expect(resolve).not.toHaveBeenCalled()
  }
})
