import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {sessionBillingRecords,replaySessionRecords} from './backfill.js'
import {defaultPeakRule} from './price-book.js'
import {wawaPricePreset} from './wawa-prices.js'
import {withLedgerLock,writeLedger} from './ledger-persistence.js'

const AUDIT='cny-price-audit-20261021-v1'
const tokens=['input','output','cacheRead','cacheWrite','reasoning','calls']
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
function historicalRecords(book) {
  const until=book.activatedAt, records=[]
  const add=(key,rate,from,sourceUrl,limit=until)=>{
    const end=Math.min(until,limit)
    if(from>=end)return
    records.push({id:AUDIT+':'+key,key,rate,source:'historical-correction',from,to:end,deletedAt:null,sourceUrl})
  }
  const flash={currency:'CNY',input:1,cachedInput:.02,output:4,offPeak:{input:1,cachedInput:.02,output:4},peak:{input:2,cachedInput:.04,output:8}}
  add('deepseek-official:deepseek-flash',{...flash,peakPricing:{...defaultPeakRule('deepseek'),holidays:book.records.find(r=>r.key==='deepseek-official:deepseek-flash')?.rate?.peakPricing?.holidays??[]}},Date.parse('2026-09-10T12:00:00+08:00'),'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/')
  add('deepseek-volc:deepseek-v4-1-flash-261017',{...flash,peakPricing:defaultPeakRule('volcengine')},Date.parse('2026-10-20T00:00:00+08:00'),'https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing')
  add('deepseek-volc:deepseek-v4-flash-ga-260731',{currency:'CNY',input:1,cachedInput:.2,output:2},Date.parse('2026-07-31T00:00:00+08:00'),'https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing',Date.parse('2026-08-21T00:00:00+08:00'))
  const manual=book.legacy?.prices?.manual??{}
  const keys=Object.keys(manual).map(key=>{const i=key.indexOf(':');return {provider:key.slice(0,i),model:key.slice(i+1)}})
  const presets=wawaPricePreset(keys)
  for(const [key,value] of Object.entries(presets)) {
    if(!isDeepStrictEqual(value,manual[key]))continue
    add(key,value,Date.parse('2026-10-14T00:00:00+08:00'),'user-confirmed-wawa-screenshot-2026-10-14')
  }
  return records
}
/** Audit only complete event/ledger matches. Missing evidence is reported, never guessed or zeroed. */
export async function auditHistoricalPricing(ledger,sessionsRoot,{apply=false}={}) {
  const book=ledger.config.prices.book
  if(!book)return null
  if(['normalized','repriced'].includes(book.audit?.status))return book.audit
  if(book.audit?.id===AUDIT)return book.audit
  const originalBookRevision=book.revision
  const config=structuredClone(ledger.config),history=historicalRecords(book)
  config.prices.book.records.push(...history)
  const originals=structuredClone(ledger.days),revised=structuredClone(ledger.days),rows=[],seen=new Set()
  let scanned=0,unreadable=0
  for await(const records of sessionBillingRecords(ledger,sessionsRoot)) {
    scanned++
    if(!records){unreadable++;continue}
    let replay
    try{replay=replaySessionRecords(records,config,null,true)}catch{unreadable++;continue}
    for(const [date,pm] of Object.entries(replay.days)) {
      const day=revised[date],session=day?.sessions?.find(r=>r.id===replay.sessionId)
      if(!session)continue
      for(const [key,bucket] of Object.entries(pm)) {
        const tag=replay.sessionId+'|'+date+'|'+key
        if(seen.has(tag))continue
        seen.add(tag)
        const old=session.byProviderModel?.[key],dayBucket=day.byProviderModel?.[key]
        if(!old||!dayBucket)continue
        const samples=replay.samples.filter(s=>!s.seed&&s.date===date&&s.providerKey===key)
        const covered=tokens.every(k=>(old[k]??0)===(bucket[k]??0))
        const priced=samples.length>0&&samples.every(s=>s.resolved.record?.source==='historical-correction')
        if(!covered||!priced){rows.push({sessionId:session.id,date,key,calls:old.calls,oldCny:old.cost,status:covered?'price-history-unverified':'log-coverage-incomplete'});continue}
        const oldCny=old.cost,newCny=bucket.cost,delta=newCny-oldCny,apiDelta=bucket.apiCost-(old.apiCost??old.cost)
        old.cost=newCny;old.apiCost=bucket.apiCost
        session.cost+=delta;session.apiCost=(session.apiCost??session.cost-delta)+apiDelta
        day.cost+=delta;day.apiCost=(day.apiCost??day.cost-delta)+apiDelta
        dayBucket.cost+=delta;dayBucket.apiCost=(dayBucket.apiCost??dayBucket.cost-delta)+apiDelta
        rows.push({sessionId:session.id,date,key,calls:old.calls,oldCny,newCny,delta,apiDelta,status:'verified',source:history.find(r=>r.key===key)?.sourceUrl})
      }
    }
  }
  for(const day of Object.values(originals))for(const session of day.sessions??[])for(const [key,bucket]of Object.entries(session.byProviderModel??{})){
    if(!seen.has(session.id+'|'+day.date+'|'+key))rows.push({sessionId:session.id,date:day.date,key,calls:bucket.calls,oldCny:bucket.cost,status:'log-unavailable'})
  }
  // A tariff period is installed only when every recorded call in that model/day is covered.
  // This prevents corrected detail views from disagreeing with untouched aggregate remnants.
  const approved=[],finalDays=structuredClone(originals)
  for(const tag of new Set(rows.map(r=>r.date+'|'+r.key))){
    const group=rows.filter(r=>r.date+'|'+r.key===tag),first=group[0],bucket=originals[first.date]?.byProviderModel?.[first.key]
    const complete=group.every(r=>r.status==='verified')&&group.reduce((n,r)=>n+r.calls,0)===(bucket?.calls??-1)
    if(!complete){for(const row of group)if(row.status==='verified'){row.status='day-coverage-incomplete';delete row.delta;delete row.newCny}continue}
    const source=history.find(r=>r.key===first.key),dayStart=Date.parse(first.date+'T00:00:00+08:00')
    approved.push({...source,id:source.id+':'+first.date,from:Math.max(source.from,dayStart),to:Math.min(source.to,dayStart+86400000)})
    for(const row of group){const day=finalDays[row.date],session=day.sessions.find(s=>s.id===row.sessionId),item=session.byProviderModel[row.key]
      item.cost=row.newCny;item.apiCost=(item.apiCost??row.oldCny)+row.apiDelta
      for(const target of [session,day,day.byProviderModel[row.key]]){target.cost+=row.delta;target.apiCost=(target.apiCost??target.cost-row.delta)+row.apiDelta}
    }
  }
  const report={id:AUDIT,at:Date.now(),scanned,unreadable,rows,verified:rows.filter(r=>r.status==='verified').length,
    pending:rows.filter(r=>r.status!=='verified').length,deltaCny:rows.reduce((n,r)=>n+(r.delta??0),0),storageFees:'not-included-no-duration',applied:false}
  if(!apply)return report
  ledger.flush()
  if(ledger.pendingWrite)throw Error('Ledger is not flushed; historical repair deferred')
  withLedgerLock(ledger.path,()=>{
    const disk=ledger.readDiskSnapshot()
    if(disk.config.prices.book.revision!==originalBookRevision)throw Error('Prices changed during audit; retry without overwriting new prices')
    // Apply only unchanged days. Calls arriving during the scan and retention moves survive intact.
    const unchanged=new Set(Object.keys(originals).filter(date=>fingerprint(disk.days[date]??null)===fingerprint(originals[date])))
    for(const row of rows)if(row.status==='verified'&&!unchanged.has(row.date)){
      row.status='changed-during-audit';delete row.delta;delete row.newCny
    }
    report.verified=rows.filter(r=>r.status==='verified').length
    report.pending=rows.length-report.verified
    report.deltaCny=rows.reduce((n,r)=>n+(r.delta??0),0)
    const dir=join(dirname(ledger.path),'pricing-backups');mkdirSync(dir,{recursive:true})
    const backup=join(dir,AUDIT+'-'+report.at+'.json');copyFileSync(ledger.path,backup,1)
    report.applied=true;report.backup=backup
    // Store the same dated tariff versions used by the correction so all detail views agree.
    disk.config.prices.book.records.push(...approved.filter(r=>unchanged.has(new Date(r.from+8*3600000).toISOString().slice(0,10))))
    disk.config.prices.book.revision++
    disk.config.prices.book.audit={id:AUDIT,at:report.at,verified:report.verified,pending:report.pending,deltaCny:report.deltaCny,reportPath:join(dir,AUDIT+'-'+report.at+'-report.json')}
    for(const date of unchanged)disk.days[date]=finalDays[date]
    writeFileSync(disk.config.prices.book.audit.reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
    writeLedger(ledger.path,disk)
    ledger.adoptSnapshot(disk);ledger.writeBase=ledger.snapshot()
  })
  return report
}
