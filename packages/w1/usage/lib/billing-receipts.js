/** Fixed, per-call CNY receipts share the ledger transaction with their aggregates. */
import {copyFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {withLedgerLock,writeLedger} from './ledger-persistence.js'
const counts=['input','output','cacheRead','cacheWrite','reasoning','cacheWrite1h','calls','cost','apiCost','unpricedCalls','estimatedCalls','stalePriceCalls']
const num=n=>Number.isFinite(n)&&n>=0?n:0

export function enableBillingReceipts(ledger,now=Date.now()){
  ledger.flush()
  if(ledger.pendingWrite)throw Error('旧账尚未保存，无法启用逐次计费记录')
  return withLedgerLock(ledger.path,()=>{
    const disk=ledger.readDiskSnapshot()??ledger.snapshot(),book=disk.config.prices.book
    if(book.accounting?.version===1){ledger.adoptSnapshot(disk);ledger.writeBase=ledger.snapshot();return book.accounting}
    const folder=join(dirname(ledger.path),'pricing-backups');mkdirSync(folder,{recursive:true})
    const backup=join(folder,`before-billing-receipts-${now}.json`)
    try{copyFileSync(ledger.path,backup,1)}catch(error){if(error.code!=='ENOENT')throw error;writeFileSync(backup,JSON.stringify(disk),{flag:'wx'})}
    book.accounting={version:1,activatedAt:now,legacyPolicy:'recorded-cny',backup}
    const previous=book.audit??{}
    book.audit={...previous,status:'normalized',normalizedAt:now,retainedGroups:previous.pending??0,pending:0,verified:previous.verified??0,deltaCny:previous.deltaCny??0}
    book.revision++
    writeLedger(ledger.path,disk);ledger.adoptSnapshot(disk);ledger.writeBase=ledger.snapshot()
    return book.accounting
  })
}

/** Session logs supply navigation identity only. They never replace a saved receipt's amount. */
export function billingSamples(ledger,sessionId,records=[]){
  const metadata=new Map()
  const remember=(usage,event,kind)=>{if(typeof usage?.billingCallId==='string')metadata.set(usage.billingCallId,{logSeq:event.type==='assistant/message'?event.seq:null,turn:event.data?.turn??null,step:event.data?.step??null,kind})}
  for(const event of records){
    if(event.type==='assistant/message')remember(event.data?.usage,event,'model')
    else if(event.type==='assistant/chunk')remember(event.data?.chunk?.usage,event,'model')
    else if(event.type==='assistant/attempt')for(const item of event.data?.stream??[])remember(item.chunk?.usage,event,'model')
    else if(event.type==='compaction/summary')remember(event.data?.usage,event,'compaction')
  }
  const samples=[]
  for(const [date,day]of Object.entries(ledger.days??{})){
    const totals=day.sessions?.find(row=>row.id===sessionId)?.byProviderModel??{},used={}
    for(const receipt of Object.values(day.receipts??{})){
      if(receipt.sessionId!==sessionId)continue
      const values=receipt.values,key=receipt.providerKey,index=key.indexOf(':'),meta=metadata.get(receipt.id)
      const sum=used[key]??=Object.fromEntries(counts.map(k=>[k,0]));for(const k of counts)sum[k]+=num(values[k])
      samples.push({date,sessionId,providerKey:key,provider:key.slice(0,index),model:key.slice(index+1),atMs:receipt.atMs,startedAtMs:receipt.startedAtMs,
        buckets:receipt.tokens,cost:values.cost,apiCost:values.apiCost,plan:receipt.planId!==null,kind:receipt.kind&&receipt.kind!=='model'?receipt.kind:meta?.kind??'model',
        turn:meta?.turn??null,step:meta?.step??null,logSeq:meta?.logSeq??null,calls:1,receiptId:receipt.id,outcome:receipt.outcome,
        resolved:receipt.pricing,peak:{enabled:false},seed:false})
    }
    // The pre-receipt remainder is a fixed aggregate, not fabricated per-call detail.
    for(const [key,total]of Object.entries(totals)){
      const rest=Object.fromEntries(counts.map(k=>[k,Math.max(0,num(total[k])-num(used[key]?.[k]))]))
      if(!rest.calls&&rest.cost<1e-8&&!rest.input&&!rest.output&&!rest.cacheRead&&!rest.cacheWrite)continue
      const index=key.indexOf(':'),atMs=Date.parse(date+'T12:00:00+08:00')
      samples.push({date,sessionId,providerKey:key,provider:key.slice(0,index),model:key.slice(index+1),atMs,buckets:rest,cost:rest.cost,apiCost:rest.apiCost,
        plan:rest.apiCost===0&&rest.cost>0,kind:'legacy',turn:null,step:null,logSeq:null,calls:rest.calls,legacy:true,
        resolved:{priced:rest.unpricedCalls===0,currency:'CNY',entry:null,estimated:true,stale:false},peak:{enabled:false},seed:false})
    }
  }
  return samples
}
