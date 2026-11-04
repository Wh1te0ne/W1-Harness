import {createHash} from 'node:crypto'
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {resolveBookPrice, bookFxAt} from './price-book.js'
import {callPrice} from './call-pricing.js'
import {withLedgerLock, writeLedger} from './ledger-persistence.js'

export const REPRICING_ID = 'w1-history-reprice-20261021-v1'
const tokenFields = ['input','output','cacheRead','cacheWrite','reasoning']
const fields = [...tokenFields,'cacheWrite1h','calls','cost','apiCost','unpricedCalls','estimatedCalls','stalePriceCalls']
const moneyFields = ['cost','apiCost','unpricedCalls','estimatedCalls','stalePriceCalls']
const n = value => Number.isFinite(value) && value >= 0 ? value : 0
const sum = rows => Object.fromEntries(fields.map(k=>[k,rows.reduce((s,r)=>s+n(r[k]),0)]))
const subtract = (a,b) => Object.fromEntries(fields.map(k=>[k,Math.max(0,n(a[k])-n(b[k]))]))
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const total = state => sum(Object.values({...state.archivedDays,...state.days}))

/** Explicit one-time estimate. Exact provider/model quotes never change the active price book. */
export function repriceHistoricalLedger(original, samplesByGroup, quotes, {at=Date.now()}={}) {
  if(original.config.prices.book.audit?.id===REPRICING_ID)throw Error('Historical repricing already applied')
  const next=structuredClone(original),book=original.config.prices.book,fx=bookFxAt(book,at)
  const rows=[],averages={}
  for(const day of Object.values({...original.archivedDays,...original.days}))for(const [key,bucket]of Object.entries(day.byProviderModel??{})){
    const groups=(day.sessions??[]).map(s=>s.byProviderModel?.[key]).filter(Boolean)
    groups.push(subtract(bucket,sum(groups)))
    for(const group of groups)if(tokenFields.some(f=>n(group[f])>0)&&group.calls>0){const a=averages[key]??=[];a.push(group)}
  }
  const priceOne=(key,tokens,when,parameters,notes)=>{
    const quote=quotes[key];if(!quote?.rate)throw Error('No exact provider/model price: '+key)
    const i=key.indexOf(':'),pricingBook={version:1,records:[{...quote,key,from:0,to:null}],fx:[{...fx,at:0}]}
    let resolved=resolveBookPrice(key.slice(0,i),key.slice(i+1),{book:pricingBook},when)
    if(!resolved.priced)throw Error('Price or exchange rate unavailable: '+key)
    if(resolved.entry.effortMultiplier!==undefined&&!Object.hasOwn(parameters??{},'outputConfigEffort')){
      notes.add('缺少动态 effort 参数，按普通倍率 1 倍估算');parameters={outputConfigEffort:null}
    }
    if(n(tokens.cacheWrite)>0&&!Number.isFinite(tokens.cacheWrite1h))notes.add('缺少缓存写入时长，按普通写入估算')
    resolved=callPrice(resolved,tokens,parameters)
    if(!resolved.priced)throw Error('Cannot price historical call: '+key)
    let tier=resolved.entry
    if(tier.longContext&&tokens.input+tokens.cacheRead+tokens.cacheWrite>tier.longContext.aboveInputTokens)tier=tier.longContext
    const write=n(tokens.cacheWrite),one=Number.isFinite(tokens.cacheWrite1h)?Math.min(write,n(tokens.cacheWrite1h)):tier.cacheWriteDefault1h?write:0
    return {input:tier.cacheMiss,output:tier.output,cacheRead:tier.cacheHit,
      cacheWrite:write?((write-one)*(tier.cacheWrite??tier.cacheHit)+one*(tier.cacheWrite1h??tier.cacheWrite??tier.cacheHit))/write:tier.cacheWrite??tier.cacheHit,
      reasoning:tier.reasoning??0}
  }
  const reprice=(bucket,receipts,key,date,sessionId)=>{
    const fixed=sum(receipts.map(r=>r.values)),legacy=subtract(bucket,fixed)
    if(!legacy.calls&&!legacy.cost&&!tokenFields.some(f=>legacy[f]>0))return
    const notes=new Set(['按本次核对的同渠道价格统一重算，不代表供应商历史结算单'])
    const quote=quotes[key];if(!quote?.rate)throw Error('No exact provider/model price: '+key)
    if(quote.note)notes.add(quote.note)
    const samples=(samplesByGroup[JSON.stringify([date,sessionId,key])]??[]).filter(s=>!s.receiptId)
    let tokens=Object.fromEntries(tokenFields.map(f=>[f,legacy[f]]))
    const observed=sum(samples.map(s=>({...s.buckets,calls:1})))
    if(!tokenFields.some(f=>tokens[f]>0)&&legacy.calls>0){
      const average=sum(averages[key]??[])
      if(!average.calls)throw Error('No same-model usage basis for missing tokens: '+key)
      tokens=Object.fromEntries(tokenFields.map(f=>[f,average[f]/average.calls*legacy.calls]))
      notes.add('用量全部缺失，费用按同渠道同型号已记录调用的平均用量估算；原 Token 数不改写')
    }
    const start=Date.parse(date+'T00:00:00+08:00'),calls=Math.max(1,legacy.calls)
    const averageTokens=Object.fromEntries(tokenFields.map(f=>[f,tokens[f]/calls]))
    // Unknown times are uniformly distributed over this Shanghai calendar day.
    const boundaries=[...new Set([0,1440,...(quote.rate.peakPricing?.windows??[]).flatMap(w=>[w.start,w.end])])].sort((a,b)=>a-b)
    const fallback=boundaries.slice(1).map((end,i)=>({weight:(end-boundaries[i])/1440,
      prices:priceOne(key,averageTokens,start+(end+boundaries[i])/2*60000,null,notes)}))
    const defaultPrice=Object.fromEntries(tokenFields.map(f=>[f,fallback.reduce((v,p)=>v+p.prices[f]*p.weight,0)]))
    const priced=samples.map(s=>({s,prices:priceOne(key,s.buckets,s.atMs,s.billingParameters,notes)}))
    const exact=samples.length===legacy.calls&&tokenFields.every(f=>observed[f]===legacy[f])
    if(!samples.length)notes.add('缺少逐次日志：上下文按平均每次输入量；峰谷按当天时段时长加权')
    else if(!exact)notes.add('日志与账本不完全一致：保留账本 Token 总量，按日志中各项 Token 的实际档位比例分摊')
    const parts=Object.fromEntries(tokenFields.map(f=>{
      const weighted=observed[f]>0?priced.reduce((v,{s,prices})=>v+n(s.buckets[f])*prices[f],0)/observed[f]:defaultPrice[f]
      return [f,tokens[f]*weighted/1e6]
    }))
    const newCny=Object.values(parts).reduce((a,b)=>a+b,0)
    if(!Number.isFinite(newCny)||newCny<0)throw Error('Invalid historical result')
    // Retain the recorded API/plan split. A formerly unpriced API bucket is paid API usage.
    const apiFraction=legacy.cost>0?Math.min(1,legacy.apiCost/legacy.cost):1
    const values={cost:fixed.cost+newCny,apiCost:fixed.apiCost+newCny*apiFraction,
      estimatedCalls:fixed.estimatedCalls+legacy.calls,unpricedCalls:fixed.unpricedCalls,stalePriceCalls:fixed.stalePriceCalls}
    const delta=Object.fromEntries(moneyFields.map(f=>[f,values[f]-n(bucket[f])]))
    Object.assign(bucket,values)
    rows.push({date,sessionId,key,calls:legacy.calls,logCalls:samples.length,before:legacy.cost,after:newCny,delta:newCny-legacy.cost,
      recordedTokens:Object.fromEntries(tokenFields.map(f=>[f,legacy[f]])),estimatedTokens:tokens,parts,notes:[...notes],quoteId:quote.id})
    return delta
  }
  const add=(target,delta)=>{if(delta)for(const f of moneyFields)target[f]=n(target[f])+delta[f]}
  for(const day of Object.values({...next.archivedDays,...next.days})){
    const receipts=Object.values(day.receipts??{}),oldModels=structuredClone(day.byProviderModel??{})
    for(const session of day.sessions??[])for(const [key,bucket]of Object.entries(session.byProviderModel??{})){
      const delta=reprice(bucket,receipts.filter(r=>r.sessionId===session.id&&r.providerKey===key),key,day.date,session.id)
      add(session,delta);add(day.byProviderModel[key],delta);add(day,delta)
    }
    for(const [key,bucket]of Object.entries(oldModels)){
      const sessionTotals=sum((original.days[day.date]??original.archivedDays?.[day.date])?.sessions?.map(s=>s.byProviderModel?.[key]??{})??[])
      const anonymous=subtract(bucket,sessionTotals)
      const delta=reprice(anonymous,receipts.filter(r=>!r.sessionId&&r.providerKey===key),key,day.date,null)
      add(day.byProviderModel[key],delta);add(day,delta)
    }
  }
  const before=total(original),after=total(next)
  for(const field of [...tokenFields,'cacheWrite1h','calls'])if(before[field]!==after[field])throw Error('Usage changed: '+field)
  const providers={}
  for(const row of rows){const key=row.key.split(':')[0],p=providers[key]??={before:0,after:0,delta:0,calls:0};for(const f of Object.keys(p))p[f]+=row[f]}
  const report={id:REPRICING_ID,at,priceDate:new Date(at).toISOString(),before:before.cost,after:after.cost,delta:after.cost-before.cost,calls:before.calls,
    repricedCalls:rows.reduce((n,r)=>n+r.calls,0),fixedReceiptCalls:before.calls-rows.reduce((n,r)=>n+r.calls,0),groups:rows.length,providers,quotes,fx,rows,previousAudit:book.audit}
  next.config.prices.book.audit={id:REPRICING_ID,status:'repriced',at,verified:0,estimatedGroups:rows.length,pending:0,
    beforeCny:report.before,afterCny:report.after,deltaCny:report.delta,repricedCalls:report.repricedCalls}
  next.config.prices.book.revision++
  next.balanceRef=null
  return {inputHash:fingerprint(original),next,report}
}

/** Apply only the exact previewed snapshot, under the ledger lock. Repeat application is harmless. */
export function applyHistoricalRepricing(path,plan){
  return withLedgerLock(path,()=>{
    const disk=JSON.parse(readFileSync(path,'utf8'))
    if(disk.config.prices.book.audit?.id===REPRICING_ID)return disk.config.prices.book.audit
    if(fingerprint(disk)!==plan.inputHash)throw Error('Ledger changed after preview; regenerate before applying')
    const folder=join(dirname(path),'pricing-backups');mkdirSync(folder,{recursive:true})
    const base=join(folder,REPRICING_ID+'-'+plan.report.at),backup=base+'-before.json',reportPath=base+'-report.json'
    if(existsSync(backup)){
      if(fingerprint(JSON.parse(readFileSync(backup,'utf8')))!==plan.inputHash)throw Error('Existing backup does not match preview')
    }else copyFileSync(path,backup,1)
    const next=structuredClone(plan.next)
    next.config.prices.book.audit={...next.config.prices.book.audit,backup,reportPath}
    writeFileSync(reportPath,JSON.stringify({...plan.report,backup,applicationEvidence:'Confirm matching audit id in ledger.json'},null,2)+'\n')
    writeLedger(path,next)
    return next.config.prices.book.audit
  })
}
