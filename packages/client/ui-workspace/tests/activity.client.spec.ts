import { expect, it } from 'vitest'
import { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/src/client/contract/slots.ts'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionStatus } from '@deepseek-ai/dsh-client-ui-session/client'
import { deriveActivity } from '../src/client/activity.ts'

it('groups by activity dates, orders attention and excludes archived, blank and child sessions', () => {
  const now = new Date(2026, 9, 23, 12).getTime()
  const sid = (id: string) => id as SessionId
  const row = (id: string, updatedAt = now, extra: Partial<SessionSummary> = {}): SessionSummary => ({
    id: sid(id), displayTitle: id, title: id, blank: false, running: false, retainedBy: {}, updatedAt, ...extra,
  })
  const rows = [row('running', now, { running: true }), row('unread'), row('waiting'), row('today'),
    row('yesterday', now - 86_400_000), row('earlier', now - 2 * 86_400_000), row('archived'),
    row('blank', now, { blank: true }), row('child', now, { origin: 'subagent', parentId: sid('running') }),
    row('recent-reply', now - 86_400_000, { projectionValues: { sessionListMetadata: { blank: false, lastPromptAt: now - 86_400_000, activityAt: now + 1, preview: 'Recorded reply' } } })]
  const list: SessionListState = { ids: rows.map(r => r.id), byId: Object.fromEntries(rows.map(r => [r.id, r])), phase: 'ready', projectionsBySession: {} }
  const statuses = new Map<SessionId, SessionStatus>([
    [sid('unread'), { running: false, completionUnread: true, pendingInteraction: undefined }],
    [sid('waiting'), { running: true, completionUnread: false, pendingInteraction: new PendingQuestion(sid('waiting'), [{ id: 'question-1', question: 'Continue?' }]) }],
  ])
  const result = deriveActivity(list, [], { pinnedSessionIds: [sid('earlier')], archivedSessionIds: [sid('archived')], archivedFilter: 'show' }, statuses, now)
  expect(result.attention.map(r => r.id)).toEqual(['waiting', 'unread', 'running'])
  expect(result.days.map(d => d.kind)).toEqual(['today', 'yesterday', 'earlier'])
  expect(result.days[0]?.rows.map(r => r.id)).toEqual(['recent-reply', 'today'])
  expect(result.days[0]?.rows[0]?.preview).toBe('Recorded reply')
  expect(result.days.flatMap(d => d.rows.map(r => r.id))).toEqual(['recent-reply', 'today', 'yesterday', 'earlier'])
})
