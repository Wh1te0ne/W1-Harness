// Shared, deterministic pricing rules. Records are append-only; closing a period never changes its tariff.
const safeKey = key => typeof key === 'string' && key.length <= 512 && /^[^:\s]+:.+$/u.test(key)
  && key === pricingKey(key.slice(0,key.indexOf(':')),key.slice(key.indexOf(':')+1))
const finiteRate = n => typeof n === 'number' && Number.isFinite(n) && n >= 0
export function pricingKey(provider, model) {
  return (String(provider || 'deepseek').trim().toLowerCase().replace(/^llm-/, '')) + ':' + String(model).trim()
}
export function validBookTier(tier) {
  return tier && ['input', 'cachedInput', 'output'].every(k => finiteRate(tier[k]))
    && ['cacheWrite', 'cacheWrite1h'].every(k => tier[k] === undefined || finiteRate(tier[k]))
    && (tier.cacheWriteExtended === undefined || Number.isSafeInteger(tier.cacheWriteExtended.seconds) && tier.cacheWriteExtended.seconds > 0 && finiteRate(tier.cacheWriteExtended.price))
}
export function validBookRate(rate) {
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
export function defaultPeakRule(preset = 'custom') {
  return { enabled: true, preset, weekdays: [1, 2, 3, 4, 5], windows: [{ start: 540, end: 720 }, { start: 840, end: 1080 }], holidays: [] }
}
export function validPriceBook(book) {
  return book?.version === 1 && Number.isFinite(book.activatedAt) && Number.isSafeInteger(book.revision) && book.revision >= 0
    && Array.isArray(book.records) && book.records.length <= 20000
    && book.records.every(r => typeof r.id === 'string' && safeKey(r.key) && Number.isFinite(r.from)
      && (r.to === null || Number.isFinite(r.to) && r.to >= r.from) && (validBookRate(r.rate) || r.source==='legacy-deletion'&&r.rate===null&&r.to===r.from&&r.deletedAt!==null))
    && new Set(book.records.map(r => r.id)).size === book.records.length
    && Array.isArray(book.fx) && book.fx.length > 0 && book.fx.every(f => Number.isFinite(f.at) && Number.isFinite(f.rate) && f.rate > 0 && f.rate < 100)
    && ['manual', 'auto'].includes(book.fxMode)
}
export function bookFxAt(book, at = Date.now()) {
  return book.fx.filter(f => f.at <= at).sort((a, b) => b.at - a.at)[0] ?? null
}
export function bookRecordAt(book, key, at = Date.now()) {
  return book.records.findLast(r => r.key === key && r.from <= at && (r.to === null || at < r.to)) ?? null
}
export function bookIsPeak(rule, at) {
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
export function resolveBookPrice(provider, model, prices, at = Date.now()) {
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
export function createPriceBook(config, now = Date.now()) {
  const rate = config.currency === 'CNY' && config.exchangeRate > 1 ? config.exchangeRate : 7.2
  const book = { version: 1, revision: 0, activatedAt: now, records: [], fxMode: 'manual',
    fx: [{ at: now, rate, source: 'legacy-setting', date: new Date(now).toISOString().slice(0, 10) }],
    legacy: { prices: structuredClone(config.prices), exchangeRate: rate, priceMatch: config.priceMatch, priceOverrides: structuredClone(config.priceOverrides ?? {}) } }
  for (const [key, value] of Object.entries(config.prices?.manual ?? {})) {
    if (safeKey(key) && validBookRate(value)) book.records.push({ id: crypto.randomUUID(), key, rate: structuredClone(value), source: 'manual', from: now, to: null, deletedAt: null })
  }
  for(const key of config.priceMatchDismissed??[]){
    if(safeKey(key)&&!book.records.some(r=>r.key===key))book.records.push({id:crypto.randomUUID(),key,rate:null,source:'legacy-deletion',from:now,to:now,deletedAt:now})
  }
  // User-confirmed CNY tariffs: these are documented snapshots, not a claimed price API.
  const flash = { currency: 'CNY', input: 1, cachedInput: .02, output: 4,
    offPeak: { input: 1, cachedInput: .02, output: 4 }, peak: { input: 2, cachedInput: .04, output: 8 } }
  for (const [key, value] of [
    ['deepseek-official:deepseek-flash', { ...flash, peakPricing: { ...defaultPeakRule('deepseek'), holidays: config.peakHolidays ?? [] } }],
    ['deepseek-official:deepseek-v4-pro', {currency:'CNY',input:4.5,cachedInput:.15,output:13.5,offPeak:{input:4.5,cachedInput:.15,output:13.5},peak:{input:9,cachedInput:.3,output:27},peakPricing:{...defaultPeakRule('deepseek'),holidays:config.peakHolidays??[]}}],
    ['deepseek-volc:deepseek-v4-1-flash-261017', { ...flash, peakPricing: defaultPeakRule('volcengine') }],
    ['deepseek-volc:doubao-seed-evolving', { currency: 'CNY', input: 6, cachedInput: 1.2, output: 30 }],
  ]) {
    if (!book.records.some(r => r.key === key) && !(config.priceMatchDismissed ?? []).includes(key))
      book.records.push({ id: crypto.randomUUID(), key, rate: structuredClone(value), source: 'confirmed-official', from: now, to: null, deletedAt: null, checkedAt: '2026-10-21' })
  }
  return book
}
export function changePriceBook(current, action, now = Date.now()) {
  if (!validPriceBook(current)) throw new Error('价格记录格式无效，未修改数据')
  if (action.revision !== current.revision) throw new Error('价格已在其他页面更新，请刷新后重试')
  if (!Number.isFinite(now) || now < Math.max(current.activatedAt,...current.fx.map(f=>f.at),...current.records.map(r=>r.from),...current.records.map(r=>r.to??0))) throw new Error('系统时间早于已保存记录，请检查时间后重试')
  const book = structuredClone(current), id = () => crypto.randomUUID()
  const active = key => book.records.findLast(r => r.key === key && r.to === null)
  if(action.type === 'init-sources') {
    book.sources??={};book.sync??={}
    for(const [provider,sourceId] of Object.entries(action.bindings))if(!Object.hasOwn(book.sources,provider))book.sources[provider]={sourceId,enabled:true}
    if(!book.sourcesInitialized){
      for(const record of book.records.filter(r=>r.to===null)){
        const importedVx=record.key.startsWith('vx-api-')&&record.from===book.activatedAt&&JSON.stringify(record.rate)===JSON.stringify(book.legacy?.prices?.manual?.[record.key])
        if(record.source==='confirmed-official'||record.source==='official-api'||importedVx)record.mode='auto'
      }
      book.sourcesInitialized=now
    }
    if(book.sources['deepseek-official']&&!book.records.some(r=>r.key==='deepseek-official:deepseek-v4-pro')){
      const pro=createPriceBook({prices:{manual:{}},peakHolidays:action.holidays??[]},now).records.find(r=>r.key==='deepseek-official:deepseek-v4-pro')
      book.records.push({...pro,mode:'auto'})
    }
  } else if(action.type==='source-mode'){
    if(!safeKey(action.provider+':model')||!action.sourceId)throw Error('渠道来源无效')
    book.sources??={};book.sources[action.provider]={sourceId:action.sourceId,enabled:action.enabled!==false}
  } else if(action.type==='record-mode'){
    const old=active(action.key);if(!old||!['auto','manual'].includes(action.mode))throw Error('价格记录不存在')
    old.to=now;book.records.push({...old,id:id(),from:now,to:null,mode:action.mode})
  } else if(action.type==='sync-result'){
    book.sync??={}
    const issues=Object.fromEntries(Object.entries(action.issues??{}).filter(([key])=>{
      const old=active(key)
      return old?old.mode==='auto':!book.records.some(r=>r.key===key&&r.deletedAt!==null)
    }))
    book.sync[action.provider]={status:Object.keys(issues).length?'partial':'ok',lastAttempt:now,lastSuccess:now,version:action.version,issues,sourceUrl:action.sourceUrl,error:null,failures:0}
    rememberStatus(book, action.provider, book.sync[action.provider], now)
    for(const [key,rate] of Object.entries(action.models)){
      if(!safeKey(key)||!key.startsWith(action.provider+':')||!validBookRate(rate))throw Error('同步价目校验失败')
      const old=active(key)
      if(old&&old.mode!=='auto'||!old&&book.records.some(r=>r.key===key&&r.deletedAt!==null))continue
      if(old&&JSON.stringify(old.rate)===JSON.stringify(rate))continue
      if(old)old.to=now
      book.records.push({id:id(),key,rate:structuredClone(rate),source:'official-api',mode:'auto',sourceId:book.sources[action.provider].sourceId,sourceUrl:action.sourceUrl,from:now,to:null,deletedAt:null,checkedAt:new Date(now).toISOString(),sourceVersion:action.version})
    }
  } else if(action.type==='sync-failure'){
    book.sync??={};const old=book.sync[action.provider]??{}
    book.sync[action.provider]={...old,status:'error',lastAttempt:now,error:String(action.error).slice(0,300),failures:(old.failures??0)+1}
    rememberStatus(book, action.provider, book.sync[action.provider], now)
  } else if(action.type==='fx-mode'){
    if(!['auto','manual'].includes(action.mode))throw Error('汇率模式无效')
    book.fxMode=action.mode
  } else if(action.type==='fx-failure'){
    book.fxStatus={...book.fxStatus,status:'error',lastAttempt:now,error:String(action.error).slice(0,300),failures:(book.fxStatus?.failures??0)+1}
    rememberStatus(book, '$fx', book.fxStatus, now)
  } else if (action.type === 'official-api') {
    for (const key of action.keys) {
      if (!key.startsWith('openrouter:')) continue
      const raw = action.models[key.slice(11)]
      if (!raw || raw.unpriced) continue
      const old = active(key)
      if (old && old.source !== 'official-api' || !old && book.records.some(r => r.key === key && r.deletedAt !== null)) continue
      const rate = {currency:'USD',input:raw.cacheMiss,cachedInput:raw.cacheHit,output:raw.output,
        ...(raw.cacheWrite===undefined?{}:{cacheWrite:raw.cacheWrite}),...(raw.longContext?{longContext:{aboveInputTokens:raw.longContext.aboveInputTokens,input:raw.longContext.cacheMiss,cachedInput:raw.longContext.cacheHit,output:raw.longContext.output}}:{})}
      if (!validBookRate(rate) || old && JSON.stringify(old.rate) === JSON.stringify(rate)) continue
      if (old) old.to = now
      book.records.push({id:id(),key,rate,source:'official-api',from:now,to:null,deletedAt:null,sourceUrl:'https://openrouter.ai/api/v1/models'})
    }
  } else if (action.type === 'save') {
    if (!safeKey(action.key) || !validBookRate(action.rate)) throw new Error('请填写有效的模型、价格和峰谷时段')
    const old = active(action.key)
    if ((old?.id ?? null) !== (action.expectedId ?? null)) throw new Error('同模型已有有效价格，请先编辑该记录')
    if (old) old.to = now
    book.records.push({ id: id(), key: action.key, rate: structuredClone(action.rate), source: 'manual', mode:'manual', from: now, to: null, deletedAt: null })
  } else if (action.type === 'delete') {
    const old = book.records.find(r => r.id === action.id && r.to === null)
    if (!old) throw new Error('该价格已变更，请刷新后重试')
    old.to = now; old.deletedAt = now
    const provider=old.key.split(':')[0],state=book.sync?.[provider]
    if(state?.issues&&Object.hasOwn(state.issues,old.key)){
      state.issues={...state.issues}
      delete state.issues[old.key]
      if(state.status==='partial'&&!Object.keys(state.issues).length)state.status='ok'
      rememberStatus(book,provider,state,now)
    }
  } else if (action.type === 'restore') {
    const old = book.records.find(r => r.id === action.id && r.deletedAt !== null)
    if (!old) throw new Error('已删除记录不存在')
    if (!old.rate) throw new Error('旧版本删除时未保留价格，请重新填写；历史消费不受影响')
    if (active(old.key)) throw new Error('同模型已有有效价格，请先处理当前价格；恢复不会覆盖它')
    book.records.push({ ...structuredClone(old), id: id(), from: now, to: null, deletedAt: null, restoredFrom: old.id })
  } else if (action.type === 'fx') {
    if (!['auto', 'manual'].includes(action.mode) || !Number.isFinite(action.rate) || action.rate <= 0 || action.rate >= 100) throw new Error('美元兑人民币汇率无效')
    book.fxMode = action.mode
    book.fx.push({ at: now, rate: action.rate, source: action.mode === 'manual' ? 'manual' : 'Frankfurter / ECB', date: action.date ?? new Date(now).toISOString().slice(0, 10) })
    book.fxStatus={status:'ok',lastAttempt:now,lastSuccess:now,error:null,failures:0}
    rememberStatus(book, '$fx', book.fxStatus, now)
  } else throw new Error('不支持的价格操作')
  book.revision++
  if (!validPriceBook(book)) throw new Error('价格记录超出容量或格式错误，未保存')
  return book
}
