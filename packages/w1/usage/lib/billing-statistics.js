/** Read-only analytics over the canonical ledger. No repricing, log scans or writes. */
import { localDayKey } from './store.js'
import { providerPriceEntryFor } from './pricing.js'
import { conversationOwners } from './session-tree.js'

export const STAT_FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'calls', 'cost', 'apiCost']
const num = n => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
export const emptyStats = () => Object.fromEntries(STAT_FIELDS.map(key => [key, 0]))
const add = (to, from) => { for (const key of STAT_FIELDS) to[key] += num(key === 'apiCost' ? from?.apiCost ?? from?.cost : from?.[key]); return to }
const valueOf = (row, basis) => basis === 'total' ? row.cost : basis === 'plan' ? Math.max(0, row.cost - row.apiCost) : row.apiCost
const identity = key => { const i = key.indexOf(':'); return i < 0 ? { provider: '', model: key } : { provider: key.slice(0, i), model: key.slice(i + 1) } }
export const matchesStats = (key, query) => { const id = identity(key); return (!query.provider || query.provider === id.provider) && (!query.model || query.model === id.model) }
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

export function statisticsQuery(raw = {}, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid statistics query')
  const to = raw.to || localDayKey(now)
  const from = raw.from || to
  if (!validDate(from) || !validDate(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 >= 3660) throw new Error('invalid statistics date range (maximum 3660 days)')
  for (const key of ['provider', 'model', 'sessionId']) if (raw[key] != null && (typeof raw[key] !== 'string' || raw[key].length > 512)) throw new Error('invalid statistics filter')
  const offset = raw.offset ?? 0
  const turnOffset = raw.turnOffset ?? 0
  if (![offset, turnOffset].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1e7)) throw new Error('invalid statistics offset')
  if (raw.basis != null && !['api', 'total', 'plan'].includes(raw.basis)) throw new Error('invalid statistics basis')
  if (raw.sort != null && !['cost', 'tokens', 'calls'].includes(raw.sort)) throw new Error('invalid statistics sort')
  return { from, to, provider: raw.provider || '', model: raw.model || '', sessionId: raw.sessionId || '', basis: raw.basis || 'api', sort: raw.sort || 'cost', offset, turnOffset }
}

export function ledgerStatisticsQuery(ledger, raw) {
  return statisticsQuery({ ...raw, from: raw?.from || Object.keys({ ...ledger.archivedDays, ...ledger.days }).sort()[0] || localDayKey(Date.now()) })
}

export function selectedStats(container, query) {
  if (!query.provider && !query.model) return add(emptyStats(), container)
  const total = emptyStats()
  for (const [key, bucket] of Object.entries(container?.byProviderModel ?? {})) if (matchesStats(key, query)) add(total, bucket)
  return total
}

export function billingStatistics(ledger, raw, sessionIds = null, headers = []) {
  const query = ledgerStatisticsQuery(ledger, raw), totals = emptyStats(), days = [], models = new Map(), sessions = new Map()
  const providers = new Set(), modelOptions = new Set(), retained = Object.keys(ledger.days ?? {}).sort()
  const assigned = emptyStats(), modeled = emptyStats(), archived = emptyStats()
  const owners = !query.sessionId
    ? conversationOwners(headers, Object.values(ledger.days ?? {}).flatMap(day => (day.sessions ?? []).map(row => row.id))) : new Map()
  const titles = new Map(Object.values(ledger.days ?? {}).flatMap(day => (day.sessions ?? []).filter(row => row.title).map(row => [row.id, row.title])))
  const headerMap = new Map(headers.map(raw => { const h = raw.header ?? raw; if (h.title) titles.set(h.id, h.title); return [h.id, h] }))
  const children = new Map(), childIds = new Set()
  const scope = sessionIds ?? new Set([query.sessionId])
  for (let at = Date.parse(query.from); at <= Date.parse(query.to); at += 86400000) {
    const date = new Date(at).toISOString().slice(0, 10), stored = ledger.days?.[date] ?? ledger.archivedDays?.[date]
    let day = stored
    if (query.sessionId) {
      const selected = (stored?.sessions ?? []).filter(row => scope.has(row.id))
      day = { ...emptyStats(), sessions: selected, byProviderModel: {} }
      for (const row of selected) {
        add(day, row)
        for (const [key, bucket] of Object.entries(row.byProviderModel ?? {})) {
          if (!Object.hasOwn(day.byProviderModel, key)) Object.defineProperty(day.byProviderModel, key, { value: emptyStats(), enumerable: true })
          add(day.byProviderModel[key], bucket)
        }
      }
    }
    const selected = selectedStats(day, query)
    if (!query.sessionId && !ledger.days?.[date] && ledger.archivedDays?.[date]) add(archived, selected)
    days.push({ date, ...selected }); add(totals, selected)
    for (const [key, bucket] of Object.entries(day?.byProviderModel ?? {})) {
      const id = identity(key)
      if (id.provider) providers.add(id.provider)
      if (!query.provider || query.provider === id.provider) modelOptions.add(id.model)
      if (!matchesStats(key, query)) continue
      const row = models.get(key) ?? { key, ...id, ...emptyStats(), priced: providerPriceEntryFor(id.provider, id.model, ledger.config.prices, { mode: ledger.config.priceMatch, overrides: ledger.config.priceOverrides }).priced }
      add(row, bucket); add(modeled, bucket); models.set(key, row)
    }
    for (const session of day?.sessions ?? []) {
      if (!session?.id) continue
      const selected = selectedStats(session, query)
      if (!selected.calls && !selected.cost && !STAT_FIELDS.slice(0, 5).some(key => selected[key])) continue
      const id = owners.get(session.id) ?? session.id
      const row = sessions.get(id) ?? { id, title: titles.get(id) || id, ...emptyStats(), own: emptyStats(), orphan: headerMap.get(id)?.origin === 'subagent', unpriced: false }
      const unpriced = Object.entries(session.byProviderModel ?? {}).some(([key, bucket]) => matchesStats(key, query) && bucket.calls > 0
        && !providerPriceEntryFor(identity(key).provider, identity(key).model, ledger.config.prices, { mode: ledger.config.priceMatch, overrides: ledger.config.priceOverrides }).priced)
      row.unpriced ||= unpriced
      if (id === session.id) add(row.own, selected)
      else {
        childIds.add(session.id)
        const key = id + '\0' + session.id
        const child = children.get(key) ?? { id: session.id, owner: id, parentId: headerMap.get(session.id)?.parentSession || id, title: titles.get(session.id) || session.id, ...emptyStats(), unpriced: false }
        add(child, selected); child.unpriced ||= unpriced; children.set(key, child)
      }
      if (session.id === id && session.title) row.title = session.title
      add(row, selected); add(assigned, selected); sessions.set(id, row)
    }
  }
  const metric = row => query.sort === 'tokens' ? row.input + row.cacheRead + row.cacheWrite + row.output : query.sort === 'calls' ? row.calls : valueOf(row, query.basis)
  const sort = (a, b) => metric(b) - metric(a) || b.calls - a.calls || String(a.id ?? a.key).localeCompare(String(b.id ?? b.key))
  for (const row of sessions.values()) {
    const items = [...children.values()].filter(child => child.owner === row.id).sort(sort)
    row.childCount = items.length; row.children = items.slice(0, 50)
  }
  return { from: query.from, to: query.to, retainedFrom: retained[0] ?? '', retainedTo: retained.at(-1) ?? '',
    totals, days, models: [...models.values()].sort(sort), providers: [...providers].sort(), modelOptions: [...modelOptions].sort(),
    sessions: [...sessions.values()].sort(sort).slice(query.offset, query.offset + 25), sessionCount: sessions.size, offset: query.offset,
    childCount: childIds.size, mainSessionCount: [...sessions.values()].filter(row => !row.orphan).length,
    archived, unassigned: Object.fromEntries(STAT_FIELDS.map(key => [key, Math.max(0, totals[key] - assigned[key] - archived[key])])),
    unassignedCost: Math.max(0, valueOf(totals, query.basis) - valueOf(assigned, query.basis) - valueOf(archived, query.basis)),
    unmodeledCost: Math.max(0, valueOf(totals, query.basis) - valueOf(modeled, query.basis)),
  }
}
