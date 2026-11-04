import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import Sessions, { Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it, vi } from 'vitest'
import { ApiSessionList } from '../src/list.ts'
import type { SessionSummary } from '../src/types.ts'
import { installSessionReadTestServices, testSessionPersistence, TEST_IMAGE_LIMITS } from './test-remote.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function fixture() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Sessions)
  await ctx.plugin(AgentRegistry)
  ctx.provide('attachments', { imageLimits: TEST_IMAGE_LIMITS } as never)
  installSessionReadTestServices(ctx)
  const list = new ApiSessionList(ctx, 16)
  await list.initialize()
  const storedSession = (name: string) => {
    const id = SessionId(name)
    return Session.create(id, undefined, { ...Session.create(id).header, cwd: '/workspace' })
  }
  const blank = storedSession('unstarted')
  const history = storedSession('history')
  history.append('turn/start', { turn: 1 })
  history.append('assistant/message', { turn: 1, step: 0, stream: [], message: createMessage({
    role: 'assistant', content: [{ type: 'text', text: 'Existing reply without opening the conversation' }],
    source: { kind: 'model', provider: 'test', model: 'test' },
  }) }, { surfaceOp: 'append' })
  history.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const stored = [blank, history]
  const inspect = vi.fn(async (id: SessionId) => {
    const session = stored.find(row => row.id === id)
    return session === undefined ? undefined : {
      meta: session.header, events: session.snapshotEvents(), inheritedEventCount: SessionLogOffset(0),
    }
  })
  ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
    list: async () => stored.map(row => row.header), inspect,
  }) as never)
  const published: SessionSummary[] = []
  ctx.on('api-session/added', (row) => { published.push(row) })
  return { ctx, list, inspect, published }
}

it('keeps listing cache-only, then repairs old previews and blank flags without activating sessions', async () => {
  const { ctx, list, inspect, published } = await fixture()
  const rows = await list.list()
  expect(inspect).not.toHaveBeenCalled()
  expect(rows.every(row => row.projections?.values.sessionListMetadata === undefined)).toBe(true)
  await list.repairMissingMetadata(rows)
  expect(published.find(row => row.sessionId === 'unstarted')?.blank).toBe(true)
  expect(published.find(row => row.sessionId === 'history')?.projections?.values.sessionListMetadata?.preview)
    .toBe('Existing reply without opening the conversation')
  expect(ctx.sessions.get(SessionId('history'))).toBeUndefined()
  expect(ctx.agents.get(SessionId('history'))).toBeUndefined()
})

it('coalesces repairs, serializes reads and skips metadata that already exists', async () => {
  const { ctx, list, published } = await fixture()
  const rows = await list.list()
  const release = Promise.withResolvers<undefined>()
  const original = ctx.sessionQuery.observeSession.bind(ctx.sessionQuery)
  const reads = vi.spyOn(ctx.sessionQuery, 'observeSession').mockImplementation(async (...args) => {
    await release.promise
    return original(...args)
  })
  const first = list.repairMissingMetadata(rows)
  const second = list.repairMissingMetadata(rows)
  await vi.waitFor(() => { expect(reads).toHaveBeenCalledTimes(1) })
  release.resolve(undefined)
  await Promise.all([first, second])
  expect(reads).toHaveBeenCalledTimes(2)
  await list.repairMissingMetadata(published)
  expect(reads).toHaveBeenCalledTimes(2)
})

it('does not publish a repair after disposal and does not open migration-required or child rows', async () => {
  const { ctx, list, published } = await fixture()
  const rows = await list.list()
  const read = vi.spyOn(ctx.sessionQuery, 'observeSession')
  await list.repairMissingMetadata(rows.map((row, i) => i === 0
    ? { ...row, formatStatus: 'migration-required' } : { ...row, origin: 'subagent' }))
  expect(read).not.toHaveBeenCalled()
  const work = list.repairMissingMetadata(rows)
  await ctx.fiber.dispose()
  await work
  expect(published).toEqual([])
})
