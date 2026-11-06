import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig, Ledger } from '../lib/store.js'
import { createPriceBook } from '../lib/price-book.js'
import { getSessionCost, hydrateSessionTitles } from '../lib/session-tree.js'
import { billingStatistics } from '../lib/billing-statistics.js'
import { createLlmStreamBilling } from '../lib/billing-stream.js'
import { sessionReceiptEvidence, planSessionAttribution, attributedLedger, applySessionAttribution } from '../lib/session-attribution.js'

const at = Date.parse('2026-10-23T01:00:00Z')
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'w1-attribution-'))
  const path = join(dir, 'ledger.json')
  const config = defaultConfig()
  config.includeSubagentCost = false
  config.prices.manual = { 'p:m': { currency: 'CNY', input: 1, cachedInput: 0.1, output: 2 } }
  config.prices.book = createPriceBook(config, at - 1000)
  config.prices.book.accounting = { version: 1 }
  writeFileSync(path, JSON.stringify({ version: 1, config, days: {} }))
  const ledger = Ledger.load(path)
  t.after(() => { ledger.close(); rmSync(dir, { recursive: true, force: true }) })
  return ledger
}
const context = query => ({ get: name => name === 'sessionQuery' ? query : undefined })
const headers = [{ id: 'parent' }, { id: 'child', origin: 'subagent', parentSession: 'parent' }]

test('defaults migrate existing disabled totals once and preserve later explicit choices', t => {
  assert.equal(defaultConfig().includeSubagentCost, true)
  const ledger = fixture(t)
  assert.equal(ledger.config.includeSubagentCost, true)
  ledger.config.includeSubagentCost = false
  ledger.scheduleWrite(); ledger.flush()
  const reopened = Ledger.load(ledger.path)
  t.after(() => reopened.close())
  assert.equal(reopened.config.includeSubagentCost, false)
})

test('parent totals include own auxiliary calls and descendants once; global totals stay unchanged', async t => {
  const ledger = fixture(t)
  const listener = createLlmStreamBilling({ now: () => at, account: (u, m, s, time, p, meta) => ledger.account({ input: u.inputTokens }, m, s, time, p, meta) })
  for (const [sessionId, purpose, inputTokens] of [['parent', undefined, 1e6], ['child', undefined, 2e6], ['parent', 'auto-review', 3e6], ['child', 'auto-review', 4e6]]) {
    for await (const _ of listener({ sessionId, purpose, model: 'm', provider: 'p' }, async function* () { yield { type: 'usage', usage: { inputTokens } }; yield { type: 'finish', reason: { kind: 'stop' } } })) {}
  }
  const result = await getSessionCost(ledger, context({ listSessions: async () => headers }), 'parent')
  assert.equal(result.own.apiCost, 4)
  assert.equal(result.subagents.apiCost, 6)
  const statistics = billingStatistics(ledger, { from: '2026-10-23', to: '2026-10-23' }, null, headers)
  assert.equal(statistics.sessions[0].apiCost, 10)
  assert.equal(statistics.totals.apiCost, 10)
  assert.equal(statistics.unassigned.apiCost, 0)
  assert.deepEqual(Object.values(ledger.days['2026-10-23'].receipts).map(r => r.kind), ['model', 'model', 'auto-review', 'auto-review'])
})

test('titles come from the public title API, include children, refresh after rename and survive a failed read', async t => {
  let reads = 0, now = at, fail = false, title = 'Current title'
  t.mock.method(Date, 'now', () => now)
  const ctx = context({ listSessions: async () => headers, readTitleSnapshots: async ids => {
    reads++
    if (fail) throw Error('temporary title read failure')
    return ids.map(id => ({ status: 'fulfilled', value: { session: { id }, title: { title: id === 'parent' ? title : 'Child title' } } }))
  } })
  const rows = () => [{ id: 'parent', title: 'Old cached ledger title', children: [{ id: 'child' }] }]
  const [a, b] = await Promise.all([hydrateSessionTitles(ctx, rows()), hydrateSessionTitles(ctx, rows())])
  assert.equal(reads, 1); assert.equal(a[0].title, 'Current title'); assert.equal(b[0].children[0].title, 'Child title')
  title = 'Renamed'; now += 6000
  assert.equal((await hydrateSessionTitles(ctx, rows()))[0].title, 'Renamed')
  fail = true; now += 6000
  assert.equal((await hydrateSessionTitles(ctx, rows()))[0].title, 'Renamed')
})

test('unavailable title service retains existing titles and can recover later', async () => {
  const rows = [{ id: 's', title: 'Historical title' }]
  assert.equal((await hydrateSessionTitles(context({ listSessions: async () => [] }), rows))[0].title, 'Historical title')
})

test('attribution requires one exact receipt ID; identical usage, timestamps and conflicting logs are insufficient', t => {
  const ledger = fixture(t)
  for (const id of ['exact', 'ambiguous', 'unknown']) ledger.account({ input: 1e6 }, 'm', undefined, at, 'p', { id })
  const observations = [new Map([['exact', { sessionId: 's', kind: 'compaction' }], ['ambiguous', { sessionId: 's', kind: 'model' }]]), new Map([['ambiguous', { sessionId: 'other', kind: 'model' }]])]
  const before = JSON.parse(readFileSync(ledger.path))
  const plan = planSessionAttribution(before, observations, at)
  assert.equal(plan.assignments.length, 1); assert.equal(plan.conflicts, 1)
  const next = attributedLedger(before, plan)
  const day = next.days['2026-10-23']
  assert.equal(day.apiCost, before.days['2026-10-23'].apiCost)
  assert.deepEqual(day.byProviderModel, before.days['2026-10-23'].byProviderModel)
  assert.equal(day.calls, 3); assert.equal(day.sessions[0].calls, 1); assert.equal(day.sessions[0].apiCost, 1)
  assert.deepEqual(day.receipts.exact.pricing, before.days['2026-10-23'].receipts.exact.pricing)
  const result = applySessionAttribution(ledger.path, plan)
  assert.equal(result.applied, 1); assert.equal(JSON.parse(readFileSync(result.backup)).days['2026-10-23'].apiCost, 3)
  assert.equal(planSessionAttribution(next, observations).assignments.length, 0)
  assert.throws(() => attributedLedger(next, plan), /changed/)
})

test('fork seed events and arbitrary tool payloads cannot claim a receipt', () => {
  const records = [{ type: 'session', id: 'child', createdAt: 100 },
    { type: 'assistant/message', time: 90, data: { usage: { billingCallId: 'old' } } },
    { type: 'assistant/message', time: 110, data: { usage: { billingCallId: 'seed' } } },
    { type: 'session/end-seed' },
    { type: 'tool/result', time: 120, data: { usage: { billingCallId: 'forged' } } },
    { type: 'assistant/attempt', time: 130, data: { stream: [{ chunk: { type: 'usage', usage: { billingCallId: 'own' } } }] } }]
  assert.deepEqual([...sessionReceiptEvidence(records)], [['own', { sessionId: 'child', kind: 'model' }]])
})
