import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { deriveFlat, sessionMemberIds, type SessionNode, type SessionRowState } from './tree.ts'

/** One activity row with project context and the latest recorded visible reply. */
export interface ActivityRow extends SessionNode {
  project: string
  preview: string
}

/** Local calendar-day group; attention rows are kept in a separate section. */
export interface ActivityDay {
  key: string
  kind: 'today' | 'yesterday' | 'earlier'
  date: number
  rows: ActivityRow[]
}

function attentionRank(row: SessionNode): number {
  return row.pendingInteraction !== undefined ? 0 : row.completed ? 1
    : row.running || row.runningSubagentCount > 0 ? 2 : 3
}

/**
 * Derive attention first, then reverse-chronological calendar days, without duplicate rows.
 * @param list - Controller summaries and cold-safe message excerpts.
 * @param workspaces - Project membership and display names.
 * @param state - Registry pin/archive facts; archived and blank rows are excluded.
 * @param statuses - Current pending, running and unread completion facts.
 * @param now - Client clock used for local calendar boundaries.
 * @returns attention rows and ordinary date groups.
 */
export function deriveActivity(
  list: SessionListState,
  workspaces: readonly WorkspaceView[],
  state: SessionRowState,
  statuses: SessionStatusSnapshot,
  now: number,
): { attention: ActivityRow[]; days: ActivityDay[] } {
  const projects = new Map(workspaces.flatMap(workspace => workspace.sessionIds.map(id => [id, workspace.title] as const)))
  const rows = deriveFlat(list, sessionMemberIds(list), { ...state, archivedFilter: 'default' }, statuses)
    .filter(row => !row.blank)
    .map((row) => {
      const metadata = list.projectionsBySession[row.id]?.values.sessionListMetadata
        ?? list.byId[row.id]?.projectionValues?.sessionListMetadata
      return { ...row, updatedAt: Math.max(row.updatedAt, metadata?.activityAt ?? 0),
        project: projects.get(row.id) ?? '', preview: metadata?.preview ?? '' }
    })
  const attention = rows.filter(row => attentionRank(row) < 3)
    .sort((a, b) => attentionRank(a) - attentionRank(b) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const days: ActivityDay[] = []
  for (const row of rows.filter(row => attentionRank(row) === 3).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))) {
    const date = new Date(row.updatedAt); date.setHours(0, 0, 0, 0)
    const key = String(date.getTime())
    let group = days.at(-1)
    if (group?.key !== key) {
      group = { key, date: date.getTime(), kind: date.getTime() === today.getTime() ? 'today'
        : date.getTime() === yesterday.getTime() ? 'yesterday' : 'earlier', rows: [] }
      days.push(group)
    }
    group.rows.push(row)
  }
  return { attention, days }
}
