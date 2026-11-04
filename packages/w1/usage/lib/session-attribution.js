/** Recover only receipt identities explicitly recorded by a session. Never infer ownership from timing or tokens. */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { listSessionLogFiles } from './session-log-files.js'
import { iterateSessionRecords } from './backfill.js'
import { withLedgerLock, writeLedger } from './ledger-persistence.js'
import { STAT_FIELDS } from './billing-statistics.js'

const fingerprint = state => createHash('sha256').update(JSON.stringify(state)).digest('hex')
const empty = () => Object.fromEntries(STAT_FIELDS.map(key => [key, 0]))

/** Committed own-call events only; inherited forks and conflicting identities are not attribution evidence. */
export function sessionReceiptEvidence(records) {
  let header = null
  const evidence = new Map()
  const remember = (usage, kind) => {
    if (typeof usage?.billingCallId === 'string' && usage.billingCallId) evidence.set(usage.billingCallId, { sessionId: header.id, kind })
  }
  for (const row of records) {
    if (row.type === 'session') { header = row; continue }
    if (!header?.id) continue
    if (row.type === 'session/end-seed') { evidence.clear(); continue }
    if (row.time < header.createdAt) continue
    if (row.type === 'assistant/message') remember(row.data?.usage, 'model')
    else if (row.type === 'assistant/chunk') remember(row.data?.chunk?.usage, 'model')
    else if (row.type === 'assistant/attempt') for (const item of row.data?.stream ?? []) remember(item.chunk?.usage, 'model')
    else if (row.type === 'compaction/summary') remember(row.data?.usage, 'compaction')
  }
  return evidence
}

export function planSessionAttribution(ledger, observations, now = Date.now()) {
  const owners = new Map()
  for (const evidence of observations) for (const [id, owner] of evidence) {
    const known = owners.get(id)
    owners.set(id, known === undefined ? owner : known?.sessionId === owner.sessionId ? known : null)
  }
  const assignments = []
  let unassigned = 0, conflicts = 0
  for (const [date, day] of Object.entries(ledger.days ?? {})) for (const receipt of Object.values(day.receipts ?? {})) {
    if (receipt.sessionId) continue
    unassigned++
    const owner = owners.get(receipt.id)
    if (owner === null) conflicts++
    if (owner && !['__proto__', 'prototype', 'constructor'].includes(owner.sessionId)) assignments.push({ date, receiptId: receipt.id, ...owner })
  }
  return { version: 1, at: now, inputHash: fingerprint(ledger), unassigned, conflicts, assignments }
}

/** Scan only accounting events. Conversation text and tool output are never retained in the plan. */
export async function inspectSessionAttribution(ledger, sessionsRoot) {
  const wanted = new Set(Object.values(ledger.days ?? {}).flatMap(day => Object.values(day.receipts ?? {}).filter(row => !row.sessionId).map(row => row.id)))
  if (!wanted.size) return planSessionAttribution(ledger, [])
  const observations = []
  let unreadableLogs = 0
  for (const file of listSessionLogFiles(sessionsRoot)) {
    const records = []
    try {
      for await (const row of iterateSessionRecords(file)) {
        if (row.type === 'session') records.push({ type: row.type, id: row.id, createdAt: row.createdAt })
        else if (row.type === 'session/end-seed') records.push({ type: row.type })
        else {
          const usages = row.type === 'assistant/message' || row.type === 'compaction/summary' ? [row.data?.usage]
            : row.type === 'assistant/chunk' ? [row.data?.chunk?.usage]
              : row.type === 'assistant/attempt' ? (row.data?.stream ?? []).map(item => item.chunk?.usage) : []
          for (const usage of usages) if (wanted.has(usage?.billingCallId)) records.push({ type: row.type === 'compaction/summary' ? row.type : 'assistant/message', time: row.time, data: { usage: { billingCallId: usage.billingCallId } } })
        }
      }
      observations.push(sessionReceiptEvidence(records))
    } catch { unreadableLogs++ }
  }
  // An unreadable log could contain a second claimant; do not certify an ambiguous corpus.
  const plan = planSessionAttribution(ledger, unreadableLogs ? [] : observations)
  return { ...plan, unreadableLogs }
}

/** Move unassigned receipts into session aggregates without changing any date, provider, price or amount. */
export function attributedLedger(ledger, plan) {
  if (fingerprint(ledger) !== plan.inputHash) throw Error('Ledger changed after attribution preview')
  const next = structuredClone(ledger)
  for (const item of plan.assignments) {
    const day = next.days[item.date], receipt = day?.receipts?.[item.receiptId]
    if (!receipt || receipt.sessionId) throw Error('Receipt is no longer unassigned')
    let session = day.sessions.find(row => row.id === item.sessionId)
    if (!session) { session = { id: item.sessionId, at: receipt.atMs, ...empty(), byProviderModel: {} }; day.sessions.push(session) }
    const bucket = session.byProviderModel[receipt.providerKey] ??= empty()
    for (const field of STAT_FIELDS) for (const target of [session, bucket]) target[field] = (target[field] ?? 0) + (receipt.values[field] ?? 0)
    receipt.sessionId = item.sessionId
    if (receipt.kind === 'model' && item.kind !== 'model') receipt.kind = item.kind
  }
  return next
}

/** Apply a preview while the owning application is stopped; retain a private backup before the atomic write. */
export function applySessionAttribution(path, plan) {
  return withLedgerLock(path, () => {
    const disk = JSON.parse(readFileSync(path, 'utf8'))
    const next = attributedLedger(disk, plan)
    if (!plan.assignments.length) return { applied: 0, unassigned: plan.unassigned }
    const folder = join(dirname(path), 'attribution-backups')
    mkdirSync(folder, { recursive: true })
    const base = join(folder, `session-attribution-${plan.at}-${plan.inputHash.slice(0, 12)}`)
    copyFileSync(path, base + '-before.json', 1)
    writeFileSync(base + '-plan.json', JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' })
    writeLedger(path, next)
    return { applied: plan.assignments.length, unassigned: plan.unassigned - plan.assignments.length, backup: base + '-before.json' }
  })
}
