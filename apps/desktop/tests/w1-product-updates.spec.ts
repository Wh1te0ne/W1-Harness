import { expect, it, vi } from 'vitest'
import { selectW1ProductRelease, W1SourceUpdates, w1UpdateChannel } from '../src/w1-product-updates.ts'
import { showW1ProductUpdate } from '../src/w1-product-update-ui.ts'
import type { DesktopUpdateState } from '../src/ipc.ts'
import type { UpdateDialogOptions } from '../src/update-dialog.ts'
import product from '../w1-product.json' with { type: 'json' }

const row = (version: string) => ({ tag_name: `v${version}`, draft: false, prerelease: version.includes('-'),
  html_url: `https://github.com/Wh1te0ne/W1-Harness/releases/tag/v${version}`, body: '# A W1 release',
  assets: [{ name: `${w1UpdateChannel(version)}.yml` }] })

it('moves existing alpha installations to numbered releases and keeps later updates on the numbered channel', () => {
  expect(selectW1ProductRelease([row('0.2.0'), row('0.1.0-alpha.4')], '0.1.0-alpha.4')?.version).toBe('0.2.0')
  expect(w1UpdateChannel('0.2.0')).toBe('latest')
  expect(selectW1ProductRelease([row('0.2.1'), row('0.3.0-alpha.1')], '0.2.0')?.version).toBe('0.2.1')
  expect(selectW1ProductRelease([row('0.1.0-alpha.4')], '0.2.0')).toBeUndefined()
})

it('keeps W1 channels independent of DSH tags and filters source-only releases', () => {
  expect(selectW1ProductRelease([{ ...row('0.2.0'), tag_name: 'dsh-v0.2.0' },
    { ...row('0.3.0'), assets: [] }, row('0.1.1-alpha.1'), row('0.1.0')], '0.1.0-alpha.4')?.version).toBe('0.1.1-alpha.1')
  expect(selectW1ProductRelease([row('0.2.0-alpha.1'), row('0.1.1')], '0.1.0')?.version).toBe('0.1.1')
  expect(selectW1ProductRelease([row('0.2.0-alpha.1')], '0.1.0-beta.1')).toBeUndefined()
  expect(selectW1ProductRelease([{ ...row('0.2.0'), html_url: 'https://example.com/wrong' }], '0.1.0')).toBeUndefined()
  expect(selectW1ProductRelease([{ ...row('0.2.0'), tag_name: 'v0.2.0-rc.1' }, row('0.1.1')], '0.1.0')?.version).toBe('0.1.1')
  expect(() => w1UpdateChannel('invalid')).toThrow()
})

it('joins source metadata checks and exposes HTTP errors instead of reporting latest', async () => {
  let finish!: (response: Response) => void
  const request = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve }))
  const publish = vi.fn((state: DesktopUpdateState) => state)
  const updates = new W1SourceUpdates(product, request, publish)
  const first = updates.check()
  expect(updates.check()).toBe(first)
  finish(new Response('[]', { status: 403 }))
  expect(await first).toMatchObject({ phase: 'error', failedOperation: 'check' })
  updates.dispose()
  await expect(updates.check()).rejects.toThrow('disposed')
})

it('source mode opens the W1 release page without downloading or installing', async () => {
  const download = vi.fn(), install = vi.fn(), openExternal = vi.fn()
  await showW1ProductUpdate({ product, locale: 'zh-CN', source: true,
    check: async () => ({ phase: 'available', version: '0.1.1' }), notes: () => 'Product notes',
    updates: { download, install }, openExternal,
    show: async () => ({ response: 0, checkboxChecked: false }) })
  expect(download).not.toHaveBeenCalled()
  expect(install).not.toHaveBeenCalled()
  expect(openExternal).toHaveBeenCalledWith('https://github.com/Wh1te0ne/W1-Harness/releases')
})

it('downloads only after consent and requires a separate install confirmation', async () => {
  const download = vi.fn(async () => ({ phase: 'ready' as const, version: '0.1.1' }))
  const install = vi.fn(), views: UpdateDialogOptions[] = []
  await showW1ProductUpdate({ product, locale: 'en', source: false,
    check: async () => ({ phase: 'available', version: '0.1.1' }), notes: () => '<script>bad()</script>\n**Fix**',
    updates: { download, install }, openExternal: vi.fn(), show: async (options) => {
      views.push(options)
      return { response: views.length === 1 ? 0 : 1, checkboxChecked: false }
    } })
  expect(download).toHaveBeenCalledWith('0.1.1')
  expect(install).not.toHaveBeenCalled()
  expect(views).toHaveLength(2)
  expect(views[0]!.release!.facts).toEqual([{ label: 'Integrated DSH baseline', value: product.upstreamTag }])
  expect(views[0]!.release!.notes!.html).not.toContain('<script>')
})

it('closing the available prompt keeps both tasks and the updater untouched', async () => {
  const download = vi.fn(), install = vi.fn()
  await showW1ProductUpdate({ product, locale: 'en', source: false,
    check: async () => ({ phase: 'available', version: '0.1.1' }), notes: () => '',
    updates: { download, install }, openExternal: vi.fn(),
    show: async () => ({ response: 1, checkboxChecked: false }) })
  expect(download).not.toHaveBeenCalled()
  expect(install).not.toHaveBeenCalled()
})

it('cancels an in-flight check without publishing into a disposed application', async () => {
  let fail!: (error: Error) => void
  const request = vi.fn(() => new Promise<Response>((_resolve, reject) => { fail = reject }))
  const publish = vi.fn((state: DesktopUpdateState) => state)
  const updates = new W1SourceUpdates(product, request, publish)
  const pending = updates.check()
  updates.dispose()
  fail(new Error('cancelled'))
  await pending
  expect(publish).toHaveBeenCalledTimes(1)
})

it('isolated packaged tests cannot install into the daily application', async () => {
  const download = vi.fn(), install = vi.fn(), openExternal = vi.fn()
  await showW1ProductUpdate({ product, locale: 'zh-CN', source: false, testing: true,
    check: async () => ({ phase: 'available', version: '0.1.1' }), notes: () => '',
    updates: { download, install }, openExternal,
    show: async () => ({ response: 0, checkboxChecked: false }) })
  expect(openExternal).toHaveBeenCalledWith('https://github.com/Wh1te0ne/W1-Harness/releases')
  expect(download).not.toHaveBeenCalled()
  expect(install).not.toHaveBeenCalled()
})
