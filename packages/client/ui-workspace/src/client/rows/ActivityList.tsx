import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { HoverCardGroup } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import type { SessionRowState } from '../tree.ts'
import { deriveActivity, type ActivityRow } from '../activity.ts'
import { SessionNodeItem } from './Rows.tsx'
import css from './ActivityList.module.css'

type ActivityProps = Pick<WorkspaceBrowserProps, 'useSessionStatus' | 'usePanelInfo' | 'open' | 'requestSessionRename'
  | 'acknowledgeCompletions' | 'renderSlot' | 't' | 'useSessionAccess' | 'openSessionMenu' | 'useContextMenu' | 'useContextMenuTarget'> & {
    list: SessionListState
    workspaces: readonly WorkspaceView[]
    rowState: SessionRowState
  }

/**
 * Cross-project activity browser; list ordering is independent of the saved project layout.
 * @param props - Framework status hooks, list facts and existing row actions.
 * @returns attention and date sections, including an explicit empty state.
 */
export function ActivityList({ list, workspaces, rowState, useSessionStatus, usePanelInfo, open,
  requestSessionRename, acknowledgeCompletions, renderSlot, useSessionAccess, openSessionMenu,
  useContextMenu, useContextMenuTarget, t }: ActivityProps) {
  const statuses = useSessionStatus(s => s)
  const panelActive = usePanelInfo(info => info.activePanelId !== null)
  const currentId = panelActive ? undefined : Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
  const [now, setNow] = useState(Date.now)
  const [limit, setLimit] = useState(30)
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()) }, 30_000)
    return () => { window.clearInterval(timer) }
  }, [])
  const { attention, days } = deriveActivity(list, workspaces, rowState, statuses, now)
  const unread = attention.filter(row => row.completed).map(row => row.id)
  const renderRow = (node: ActivityRow) => (
    <SessionNodeItem key={node.id} node={node} currentId={currentId} now={now} onOpen={open}
      onRenameRequest={requestSessionRename} renderSlot={renderSlot} t={t}
      useSessionAccess={useSessionAccess} openSessionMenu={openSessionMenu}
      useContextMenu={useContextMenu} useContextMenuTarget={useContextMenuTarget}
      activity={{ project: node.project, preview: node.preview || t(node.pendingInteraction !== undefined
        ? 'activity.waiting' : node.running || node.runningSubagentCount > 0 ? 'activity.running'
          : node.completed ? 'activity.unread' : 'activity.noPreview') }} />
  )
  let remaining = limit
  return (
    <HoverCardGroup className={clsx(css.list)}>
      <section aria-label={t('activity.attention')}>
        <div className={css.heading}><span>{t('activity.attention')}</span>
          {unread.length > 0 && <button type="button" onClick={() => { acknowledgeCompletions(unread) }}>{t('activity.markRead')}</button>}
        </div>
        <div role="tree" aria-label={t('activity.attention')}>
          {attention.length > 0 ? attention.map(renderRow) : <p className={css.empty}>{t('activity.caughtUp')}</p>}
        </div>
      </section>
      {days.map((day) => {
        const rows = day.rows.slice(0, Math.max(0, remaining)); remaining -= rows.length
        if (rows.length === 0) return null
        const label = day.kind === 'earlier' ? new Date(day.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : t(`activity.${day.kind}`)
        return <section key={day.key} aria-label={label}><div className={css.heading}>{label}</div>
          <div role="tree" aria-label={label}>{rows.map(renderRow)}</div></section>
      })}
      {days.reduce((n, day) => n + day.rows.length, 0) > limit
        && <button className={css.more} type="button" onClick={() => { setLimit(n => n + 30) }}>{t('activity.more')}</button>}
    </HoverCardGroup>
  )
}
