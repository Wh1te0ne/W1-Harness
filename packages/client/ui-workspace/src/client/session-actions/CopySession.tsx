/** Session copy actions grouped in the context menu. */
import { IconCopyOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionCopyInjected, SessionMenuItemProps } from '../contract/slots.ts'

/** Render clipboard actions using the row identity without opening its conversation. */
export function CopySessionMenuItem({
  sessionId, useMenuOpenState, copySession, desktopLinks, useSessions, t,
}: SessionMenuItemProps<SessionCopyInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  const cwd = useSessions(list => list.byId[sessionId]?.cwd)
  return <MenuItemButton icon={<IconCopyOutlineRegular />} submenu={[
    { id: 'link', label: t('menu.copyLink'), disabled: !desktopLinks },
    { id: 'markdown', label: t('menu.copyMarkdown') },
    { id: 'directory', label: t('menu.copyDirectory'), disabled: !cwd },
    { id: 'id', label: t('menu.sessionId') },
  ]} onSubmenuSelect={(kind) => {
    setMenuOpen(false)
    if (kind === 'link' || kind === 'markdown' || kind === 'directory' || kind === 'id') void copySession(sessionId, kind)
  }} onSelect={() => {}}>{t('menu.copy')}</MenuItemButton>
}
