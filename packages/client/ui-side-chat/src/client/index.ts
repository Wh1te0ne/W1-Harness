import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { IconNewChatOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { SideChatModel } from './model.ts'
import { SideChat, SideChatTitle, type SideInjected } from './SideChat.tsx'
import { en, zh } from './locales.ts'

export const inject = ['remote', 'remote.w1SideChat', 'remote.session', 'slots', 'locale', 'sidebarRight', 'sidebarRightTabs']
export function apply(ctx: Context): void {
  const models = new Map<string, SideChatModel>()
  const keyOf = (sessionId: SessionId, id: string) => JSON.stringify([sessionId, id])
  const get = (sessionId: SessionId, id: string): SideChatModel => {
    const key = keyOf(sessionId, id)
    let model = models.get(key)
    if (model === undefined) {
      model = new SideChatModel(ctx.remote, sessionId, randomUUID())
      models.set(key, model)
    }
    return model
  }
  const dispose = async (sessionId: SessionId, id: string) => {
    const key = keyOf(sessionId, id)
    const model = models.get(key)
    models.delete(key)
    await model?.dispose()
  }
  ctx.effect(() => async () => { await Promise.allSettled([...models.values()].map(model => model.dispose())); models.clear() })
  ctx.effect(() => ctx.locale.register('w1SideChat', { en, zh }))
  const t = ctx.locale.bind('w1SideChat')
  const id = '@deepseek-ai/dsh-client-ui-side-chat'
  ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind: 'w1-side-chat', multiple: true, keepMounted: true,
    priority: 'builtin', title: () => t('title'),
    guide: [{ id: 'new', order: 40, title: () => t('title'), description: () => t('description'), icon: IconNewChatOutlineRegular }],
  }))
  ctx.effect(() => ctx.sidebarRight.registerCloseHandler('w1-side-chat', (sessionId, tab, retry) => {
    const model = models.get(keyOf(sessionId, tab.id))
    if (model !== undefined && !model.requestClose(retry)) return false
    void dispose(sessionId, tab.id).catch((error: unknown) => { ctx.logger.warn('Side chat cleanup failed', error) })
  }))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: id, locale: 'w1SideChat',
    inject: (sessionId): SideInjected => ({
      actionsFor: id => get(sessionId, id),
      newChat: () => { ctx.sidebarRight.openTabIn(sessionId, 'w1-side-chat') },
      keyedHooks: { sideChat: id => get(sessionId, id).state },
    }),
  }, SideChat)))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: id, locale: 'w1SideChat',
    inject: sessionId => ({ keyedHooks: { sideChat: (id: string) => get(sessionId, id).state } }),
  }, SideChatTitle)))
}
