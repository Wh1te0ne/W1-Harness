// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ComponentType } from 'react'
const require = createRequire(import.meta.url)
const effects: (() => void)[] = []
afterEach(() => { cleanup(); effects.splice(0).forEach(f => f()); vi.unstubAllGlobals() })
it('renders phone management as a settings section and confirms device removal inline', async () => {
  const state = { relay: 'https://relay.example.test', enabled: true, status: 'online', devices: [{ id: 'phone-1', name: '测试手机', online: false }], pending: [], pairing: null, error: null }
  const bridge = { manage: vi.fn(async (action: string) => action === 'revoke' ? { ...state, devices: [] } : state) }
  vi.stubGlobal('dshDesktop', { remote: bridge })
  const module = new Function('require', readFileSync(resolve('apps/w1-remote/desktop-ui.js'), 'utf8') + '\nreturn {apply}') (require)
  const entries: { name: string; id: string }[] = []
  let Page: ComponentType<{ bridge: typeof bridge }> | undefined
  module.apply({ effect: (fn: () => () => void) => { effects.push(fn()) }, locale: { register: () => () => {}, bind: () => () => '远程连接' }, slots: { inject: (_name: string, fn: () => void) => fn(), register: (entry: { name: string; id: string }, component: ComponentType<{ bridge: typeof bridge }>) => { entries.push(entry); Page = component } } })
  expect(entries.map(e => e.name)).toEqual(['settings.section'])
  render(createElement(Page!, { bridge }))
  await screen.findByText('测试手机')
  expect(screen.getByRole('heading', { name: '远程连接' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '解除绑定' }))
  expect(bridge.manage).not.toHaveBeenCalledWith('revoke', expect.anything())
  fireEvent.click(screen.getByRole('button', { name: '确认解除' }))
  await waitFor(() => expect(bridge.manage).toHaveBeenCalledWith('revoke', { id: 'phone-1' }))
  expect(await screen.findByText('尚未绑定手机')).toBeTruthy()
})
