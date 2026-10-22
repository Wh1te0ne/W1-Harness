const PRICE_BOOK = (() => {
// Shared, deterministic pricing rules. Records are append-only; closing a period never changes its tariff.
const safeKey = key => typeof key === 'string' && key.length <= 512 && /^[^:\s]+:.+$/u.test(key)
  && key === pricingKey(key.slice(0,key.indexOf(':')),key.slice(key.indexOf(':')+1))
const finiteRate = n => typeof n === 'number' && Number.isFinite(n) && n >= 0
function pricingKey(provider, model) {
  return (String(provider || 'deepseek').trim().toLowerCase().replace(/^llm-/, '')) + ':' + String(model).trim()
}
function validBookTier(tier) {
  return tier && ['input', 'cachedInput', 'output'].every(k => finiteRate(tier[k]))
    && ['cacheWrite', 'cacheWrite1h'].every(k => tier[k] === undefined || finiteRate(tier[k]))
    && (tier.cacheWriteExtended === undefined || Number.isSafeInteger(tier.cacheWriteExtended.seconds) && tier.cacheWriteExtended.seconds > 0 && finiteRate(tier.cacheWriteExtended.price))
}
function validBookRate(rate) {
  return rate && ['CNY', 'USD'].includes(rate.currency) && validBookTier(rate)
    && (rate.effortMultiplier === undefined || finiteRate(rate.effortMultiplier) && rate.effortMultiplier > 0 && rate.effortMultiplier <= 100)
    && (!rate.longContext || (Number.isSafeInteger(rate.longContext.aboveInputTokens) && rate.longContext.aboveInputTokens > 0 && validBookTier(rate.longContext)))
    && (!rate.peakPricing?.enabled || (validBookTier(rate.offPeak) && validBookTier(rate.peak)
      && ['deepseek', 'volcengine', 'custom'].includes(rate.peakPricing.preset)
      && Array.isArray(rate.peakPricing.weekdays) && rate.peakPricing.weekdays.length > 0
      && rate.peakPricing.weekdays.every(n => Number.isInteger(n) && n >= 0 && n <= 6)
      && Array.isArray(rate.peakPricing.windows) && rate.peakPricing.windows.length > 0 && rate.peakPricing.windows.length <= 8
      && rate.peakPricing.windows.every(w => Number.isInteger(w.start) && Number.isInteger(w.end) && w.start >= 0 && w.end <= 1440 && w.start < w.end)
      && Array.isArray(rate.peakPricing.holidays) && rate.peakPricing.holidays.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))))
}
function defaultPeakRule(preset = 'custom') {
  return { enabled: true, preset, weekdays: [1, 2, 3, 4, 5], windows: [{ start: 540, end: 720 }, { start: 840, end: 1080 }], holidays: [] }
}
function bookFxAt(book, at = Date.now()) {
  return book.fx.filter(f => f.at <= at).sort((a, b) => b.at - a.at)[0] ?? null
}
function bookRecordAt(book, key, at = Date.now()) {
  return book.records.findLast(r => r.key === key && r.from <= at && (r.to === null || at < r.to)) ?? null
}
function bookIsPeak(rule, at) {
  const date = new Date(at + 8 * 3600000), day = date.toISOString().slice(0, 10)
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes()
  return rule.weekdays.includes(date.getUTCDay()) && !rule.holidays.includes(day)
    && rule.windows.some(w => minute >= w.start && minute < w.end)
}
function canonicalTier(tier, factor, ttl) {
  const out = { cacheMiss: tier.input * factor, cacheHit: tier.cachedInput * factor, output: tier.output * factor,
    cacheWrite: (tier.cacheWrite ?? tier.input) * factor,
    ...(tier.cacheWrite1h === undefined ? {} : {cacheWrite1h:tier.cacheWrite1h * factor}),
    ...(tier.cacheWrite === undefined ? {cacheWriteUnspecified:true} : {}),
    ...(ttl === '1h' ? {cacheWriteDefault1h:true} : {}),
    ...(tier.cacheWriteExtended?{cacheWriteExtended:{...tier.cacheWriteExtended,price:tier.cacheWriteExtended.price*factor}}:{}) }
  if (tier.longContext) out.longContext = { ...canonicalTier(tier.longContext, factor, ttl), aboveInputTokens: tier.longContext.aboveInputTokens }
  return out
}
function staleAt(book, provider, key, at) {
  const history = book.syncHistory?.[provider]
  const state = history ? history.findLast(row => row.at <= at) : book.sync?.[provider]
  return !!state && (state.at ?? state.lastAttempt) <= at && (state.status === 'error' || !!state.issues?.[key])
}
function rememberStatus(book, provider, state, now) {
  book.syncHistory ??= {}
  const history = book.syncHistory[provider] ??= []
  const next = { status: state.status, issues: state.issues ?? {} }
  const last = history.at(-1)
  if (!last || JSON.stringify({status:last.status,issues:last.issues}) !== JSON.stringify(next)) history.push({at:now,...next})
}
function resolveBookPrice(provider, model, prices, at = Date.now()) {
  const book = prices.book, key = pricingKey(provider, model), record = bookRecordAt(book, key, at)
  const unknown = { entry: null, currency: 'CNY', billingMode: 'flat', matched: false, priced: false, source: 'none' }
  if (!record) return unknown
  const fx = bookFxAt(book, at), factor = record.rate.currency === 'USD' ? fx?.rate : 1
  if (!(factor > 0)) return unknown
  const rate = record.rate, peak = rate.peakPricing?.enabled && bookIsPeak(rate.peakPricing, at)
  const selected = rate.peakPricing?.enabled ? {...rate, ...(peak ? rate.peak : rate.offPeak)} : rate
  const entry = canonicalTier(selected, factor, rate.cacheWriteTtl)
  if(rate.effortMultiplier !== undefined)entry.effortMultiplier=rate.effortMultiplier
  return { entry, currency: 'CNY', billingMode: 'flat', priced: true, matched: true,
    manual: record.source !== 'official-api', source: record.source, priceVersion: record.id,
    rateCurrency: rate.currency, exchangeRate: factor, exchangeRateDate: fx?.date ?? null, tier: rate.peakPricing?.enabled ? peak ? 'peak' : 'offPeak' : 'flat',
    stale: record.mode === 'auto' && staleAt(book, record.key.split(':')[0], record.key, at) || rate.currency === 'USD' && staleAt(book, '$fx', '', at), record }
}

return {resolveBookPrice, bookFxAt, bookRecordAt, defaultPeakRule, validBookRate}; })();
