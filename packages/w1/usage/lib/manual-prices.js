// Shared by host billing and the browser. Manual rates never modify vendor catalogs.
export function manualPriceKey(provider, model) {
  const channel = String(provider ?? '').trim().toLowerCase().replace(/^llm-/, '') || 'deepseek'
  return channel + ':' + String(model ?? '').trim()
}

function validManualTier(entry) {
  return entry !== null && typeof entry === 'object' && !Array.isArray(entry)
    && ['input', 'cachedInput', 'output'].every(key => typeof entry[key] === 'number' && Number.isFinite(entry[key]) && entry[key] >= 0)
    && ['cacheWrite', 'cacheWrite1h'].every(key => entry[key] === undefined || (typeof entry[key] === 'number' && Number.isFinite(entry[key]) && entry[key] >= 0))
}

export function validManualPrice(entry) {
  return validManualTier(entry) && ['USD', 'CNY'].includes(entry.currency)
    && (entry.cacheWriteTtl === undefined || ['5m', '1h'].includes(entry.cacheWriteTtl))
    && (entry.longContext === undefined || (validManualTier(entry.longContext)
      && Number.isSafeInteger(entry.longContext.aboveInputTokens) && entry.longContext.aboveInputTokens > 0))
    && (entry.cacheWriteTtl !== '1h' || (entry.cacheWrite1h !== undefined
      && (!entry.longContext || entry.longContext.cacheWrite1h !== undefined)))
}

// DSH currently exposes only total cache-write tokens. Select the explicitly
// configured duration; never infer a duration from token counts or model names.
function manualTier(entry, ttl) {
  return { cacheMiss: entry.input, cacheHit: entry.cachedInput, output: entry.output,
    cacheWrite: ttl === '1h' ? entry.cacheWrite1h : (entry.cacheWrite ?? entry.input) }
}

export function validManualPrices(table) {
  return table !== null && typeof table === 'object' && !Array.isArray(table)
    && Object.keys(table).length <= 1000
    && Object.entries(table).every(([key, entry]) => key.length <= 512 && /^[^:\s]+:.+$/u.test(key) && validManualPrice(entry))
}

export function resolveManualPrice(provider, model, prices) {
  const key = manualPriceKey(provider, model)
  const table = prices?.manual
  const entry = table && Object.hasOwn(table, key) ? table[key] : null
  if (!validManualPrice(entry)) return null
  return {
    entry: { ...manualTier(entry, entry.cacheWriteTtl), ...(entry.longContext ? {
      longContext: { ...manualTier(entry.longContext, entry.cacheWriteTtl), aboveInputTokens: entry.longContext.aboveInputTokens },
    } : {}) },
    currency: entry.currency, billingMode: 'flat', priced: true, matched: true, manual: true,
  }
}
