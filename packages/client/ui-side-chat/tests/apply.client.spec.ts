import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSidebarRightController } from '../../ui-sidebar-right/src/client/service.ts'
import { SidebarRightTabRegistry } from '../../ui-sidebar-right/src/client/tab-registry.ts'
import { createSidebarRightStore } from '../../ui-sidebar-right/src/client/stores.ts'
import { tabInfoFactory } from '../../ui-sidebar-right/src/client/tab-info.ts'
import { apply, inject } from '../src/client/index.ts'
import type { SideInjected } from '../src/client/SideChat.tsx'

function FixtureRoot(_props: PropsRenderSlots<'sidebar.right.pane.tab' | 'sidebar.right.pane.tab.title'>) { return null }

async function boot(dependencies = inject) {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  const sessionId = SessionId('side-main')
  const tabs = new SidebarRightTabRegistry(ctx)
  const { controller, adopt, show } = createSidebarRightController(tabs, () => {}, {
    autoFullscreen: () => false, openWithFocus: (_sid, open) => { open() }, closeWithFocus: (_sid, _pane, close) => { close() },
  })
  const surface = createSidebarRightStore(() => ({ kind: 'guide', title: 'guide' })).create()
  adopt(sessionId, surface); show(sessionId)
  ctx.provide('sidebarRight', controller)
  ctx.provide('sidebarRightTabs', tabs)
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: {
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
    'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: tabInfoFactory } } },
  } }, FixtureRoot)
  const catalog = { default: { provider: 'fixture', model: 'main' }, groups: [], failures: [], routableProviders: [] }
  const discover = vi.fn(async () => ({ ok: true as const, value: catalog }))
  const close = vi.fn(async () => ({ ok: true as const, value: undefined }))
  const send = vi.fn(async function* (_session: string, _id: string, _text: string, _route: object, includeContext: boolean) {
    expect(includeContext).toBe(true)
    yield { kind: 'text' as const, text: 'fixture answer' }
  })
  // Sibling-owned namespace services enforce declared injection; only the transport is a fixture.
  class FixtureRemote extends Service {}
  await ctx.plugin({ name: 'fixture-remote', apply: (transport: Context) => {
    new FixtureRemote(transport, 'remote')
    transport.provide('remote.session', { modelCatalog: discover } as never)
    transport.provide('remote.w1SideChat', {
      async *open(_sid: string, _id: string, signal: AbortSignal) {
        yield { route: catalog.default, contextMessages: 3 }
        if (!signal.aborted) await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      }, send, close,
    } as never)
  } }).await()
  const fiber = ctx.plugin({ inject: [...dependencies], apply })
  await fiber.await()
  controller.openTab('w1-side-chat')
  const tab = controller.tabsIn(sessionId).find(tab => tab.kind === 'w1-side-chat')!
  const entry = slots.entries('sidebar.right.pane.tab')[0]!
  const resolve = entry.inject as NonNullable<typeof entry.inject> & ((id: SessionId) => SideInjected)
  const injected = resolve(sessionId)
  const actions = injected.actionsFor(tab.id)
  const state = injected.keyedHooks.sideChat(tab.id)
  return { ctx, controller, sessionId, tab, actions, state, discover, close, fiber, injected }
}

describe('side-chat client composition with real Cordis injection and sidebar', () => {
  it('reproduces the missing namespace failure when remote.session is omitted', async () => {
    const h = await boot(inject.filter(name => name !== 'remote.session'))
    await vi.waitFor(() => { expect(h.state.getSnapshot().catalogError).toContain('"remote.session" without inject') })
    expect(h.discover).not.toHaveBeenCalled()
  })
  it('opens and loads model choices through the declared remote.session dependency', async () => {
    const h = await boot()
    await vi.waitFor(() => { expect(h.state.getSnapshot()).toMatchObject({ phase: 'idle', catalogError: null, error: null }) })
    await vi.waitFor(() => { expect(h.state.getSnapshot().catalog).not.toBeNull() })
    expect(h.discover).toHaveBeenCalledOnce()
    h.controller.closeIn(h.sessionId, h.tab.id)
    expect(h.controller.tabsIn(h.sessionId)).not.toContainEqual(h.tab)
    await vi.waitFor(() => { expect(h.close).toHaveBeenCalledOnce() })
  })
  it('keeps history on Cancel and removes only the requested tab on Confirm', async () => {
    const h = await boot()
    await vi.waitFor(() => { expect(h.state.getSnapshot().phase).toBe('idle') })
    h.actions.draft('retain this conversation'); await h.actions.send()
    h.controller.closeIn(h.sessionId, h.tab.id)
    expect(h.state.getSnapshot().closeRequested).toBe(true)
    expect(h.controller.tabsIn(h.sessionId)).toContainEqual(h.tab)
    expect(h.close).not.toHaveBeenCalled()
    h.actions.cancelClose()
    expect(h.state.getSnapshot().messages).toHaveLength(2)
    h.injected.newChat()
    const other = h.controller.tabsIn(h.sessionId).find(tab => tab.id !== h.tab.id)!
    h.controller.closeIn(h.sessionId, h.tab.id)
    h.actions.confirmClose()
    expect(h.controller.tabsIn(h.sessionId)).toEqual([other])
    await vi.waitFor(() => { expect(h.close).toHaveBeenCalledOnce() })
    await h.fiber.dispose()
    expect(h.ctx.get('slots')!.entries('sidebar.right.pane.tab')).toHaveLength(0)
  })
})
