import { afterEach, expect, it, vi } from 'vitest'
import { showW1Upstream } from '../src/w1-upstream-ui.ts'
import type { W1UpstreamUpdates } from '../src/w1-upstream.ts'
import type { UpdateDialogOptions } from '../src/update-dialog.ts'

vi.mock('electron', () => ({ clipboard: { writeText: vi.fn() }, shell: { openExternal: vi.fn() } }))
afterEach(() => { vi.unstubAllEnvs() })

function fixture(): Pick<W1UpstreamUpdates, 'product' | 'state' | 'check' | 'acknowledge'> {
  return {
    product: { name: 'W1 Harness', version: '0.1.0-alpha.2', appId: 'local.w1.harness', protocol: 'w1-harness',
      upstreamTag: 'dsh-v0.2.1-rc.1', upstreamPublishedAt: '2026-10-17T05:22:10Z' },
    state: { releases: [{ tag: 'dsh-v0.2.1-rc.2', publishedAt: '2026-10-17T08:16:33Z', prerelease: true,
      url: 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2', body: '### 新增功能\n\n- Search API' }],
    notified: [], seen: [], deferred: [], lastSuccess: '2026-10-17T13:22:24Z', error: null, checking: false },
    check: vi.fn(async () => {}), acknowledge: vi.fn(async () => {}),
  }
}

it('separates current baseline, new release, and local publication time with an explicit offset', async () => {
  vi.stubEnv('TZ', 'Asia/Shanghai')
  const updates = fixture()
  const show = vi.fn(async (options: UpdateDialogOptions) => ({ response: options.cancelId!, checkboxChecked: false }))
  await showW1Upstream(updates, 'zh-CN', show)
  expect(show.mock.calls[0]![0]).toMatchSnapshot()
  expect(show.mock.calls[0]![0].release!.facts[1]!.value).toBe('2026/10/17 16:16:33 (GMT+08:00)')
  expect(updates.acknowledge).toHaveBeenLastCalledWith('dsh-v0.2.1-rc.2', true)
})

it('shows no pending release after integration and retains the baseline publication time', async () => {
  vi.stubEnv('TZ', 'Asia/Shanghai')
  const before = fixture()
  const updates = { ...before, product: { ...before.product, version: '0.1.0-alpha.3', upstreamTag: 'dsh-v0.2.1-rc.2',
    upstreamPublishedAt: '2026-10-17T08:16:33Z' }, state: { ...before.state, releases: [] } }
  const show = vi.fn(async (options: UpdateDialogOptions) => ({ response: options.cancelId!, checkboxChecked: false }))
  await showW1Upstream(updates, 'zh-CN', show)
  expect(show.mock.calls[0]![0]).toMatchSnapshot()
  expect(show.mock.calls[0]![0].release!.notes).toBeUndefined()
})

it('keeps the check failure visible alongside retained release information', async () => {
  const before = fixture()
  const updates = { ...before, state: { ...before.state, error: 'rate-limit' } }
  const show = vi.fn(async (options: UpdateDialogOptions) => ({ response: options.cancelId!, checkboxChecked: false }))
  await showW1Upstream(updates, 'en', show)
  expect(show.mock.calls[0]![0]).toMatchObject({ message: 'Upstream check incomplete; previous results retained',
    detail: 'GitHub rate limit reached. Retry later.', release: { versions: [{ value: 'dsh-v0.2.1-rc.1' }, { value: 'dsh-v0.2.1-rc.2 · Prerelease' }] } })
})
