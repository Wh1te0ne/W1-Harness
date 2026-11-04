import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {defaultConfig,Ledger,zeroDay} from '../lib/store.js'
import {createPriceBook} from '../lib/price-book.js'
import {enableBillingReceipts,billingSamples} from '../lib/billing-receipts.js'
import {createLlmStreamBilling} from '../lib/billing-stream.js'
import {costFromSamples,getSessionBilling,getTurnCost} from '../lib/turn-cost.js'
import {billingStatistics} from '../lib/billing-statistics.js'
import {sessionBillingSchema} from '../lib/typert.host.js'
import {__testProjection} from '../lib/index.js'
const at=Date.parse('2026-10-21T08:00Z')
function fixture(t,history=false){
 const dir=mkdtempSync(join(tmpdir(),'w1-receipts-'));t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'w1-receipts-'));rmSync(dir,{recursive:true,force:true})})
 const config=defaultConfig();config.prices.manual={'p:m':{currency:'USD',input:1,cachedInput:.1,output:2,cacheWrite:3,cacheWrite1h:6}};config.prices.book=createPriceBook(config,at-1000);config.exchangeRate=1
 config.prices.book.audit={id:'cny-price-audit-20261021-v1',verified:6,pending:29,deltaCny:20.8}
 const days={};if(history){const values={...zeroDay('2026-10-20'),input:100,calls:8,cost:12,apiCost:10};days['2026-10-20']={...values,byProviderModel:{'p:m':{...values}},sessions:[{...values,id:'s',byProviderModel:{'p:m':{...values}}}]}}
 const path=join(dir,'ledger.json');writeFileSync(path,JSON.stringify({version:1,config,days}));const ledger=Ledger.load(path);t.after(()=>ledger.close());enableBillingReceipts(ledger,at);return ledger
}
const tokens={input:1e6,output:1e6,cacheRead:1e6,cacheWrite:2e6,cacheWrite1h:1e6}
const eventsFor=id=>[{type:'turn/start',seq:1,time:at,data:{turn:1}},{type:'assistant/message',seq:3,time:at+100,data:{turn:1,step:0,usage:{billingCallId:id}}},{type:'turn/end',seq:4,time:at+200,data:{turn:1}}]
const ctxFor=events=>({get:name=>name==='sessions'?{get:()=>({header:{id:'s',createdAt:at},snapshotEvents:()=>events}),list:()=>[]}:undefined})
test('legacy normalization is backed up, idempotent and never changes amounts or invents per-call prices',t=>{
 const ledger=fixture(t,true),before=ledger.sumDays('').cost;assert.equal(before,12);assert.equal(ledger.config.prices.book.audit.pending,0);assert.equal(ledger.config.prices.book.audit.retainedGroups,29)
 const saved=readFileSync(ledger.path,'utf8');enableBillingReceipts(ledger,at+1);assert.equal(readFileSync(ledger.path,'utf8'),saved)
 assert.equal(readdirSync(join(resolve(ledger.path,'..'),'pricing-backups')).length,1)
 const detail=costFromSamples(billingSamples(ledger,'s'),ledger.config);assert.equal(detail.cost,12);assert.equal(detail.apiCost,10);assert.equal(detail.representedCalls,8);assert.equal(detail.calls[0].kind,'legacy');assert.equal(detail.rows[0].bucket,'legacy')
})
test('same-id retries are idempotent but equal distinct calls survive and commit receipt plus totals together',t=>{
 const ledger=fixture(t);ledger.account(tokens,'m','s',at+10,'p',{id:'call-a'});ledger.account(tokens,'m','s',at+10,'p',{id:'call-a'});ledger.account(tokens,'m','s',at+10,'p',{id:'call-b'})
 const disk=JSON.parse(readFileSync(ledger.path));assert.equal(disk.days['2026-10-21'].calls,2);assert.equal(Object.keys(disk.days['2026-10-21'].receipts).length,2)
 assert.equal(disk.days['2026-10-21'].cost,174.24);assert.equal(disk.days['2026-10-21'].cacheWrite1h,2e6)
 const reopened=Ledger.load(ledger.path);t.after(()=>reopened.close());assert.equal(costFromSamples(billingSamples(reopened,'s'),reopened.config).cost,174.24)
})
test('FX, prices and deletion cannot revalue receipt details; all stats faces agree',async t=>{
 const ledger=fixture(t);ledger.account(tokens,'m','s',at+10,'p',{id:'call-a'});const expected=ledger.sumDays('').cost
 let b=ledger.config.prices.book;ledger.updatePricing({type:'fx',mode:'manual',rate:8,revision:b.revision},at+20);b=ledger.config.prices.book
 ledger.updatePricing({type:'delete',id:b.records.find(r=>r.key==='p:m').id,revision:b.revision},at+30)
 const events=eventsFor('call-a'),ctx=ctxFor(events),detail=sessionBillingSchema.parse(await getSessionBilling(ledger,ctx,{sessionId:'s',from:'2026-10-21',to:'2026-10-21'}))
 assert.equal(detail.cost,expected);assert.equal(detail.recorded.cost,expected);assert.equal(detail.rows.find(r=>r.bucket==='cacheWrite1h').rate,43.2);assert.equal(detail.calls[0].receiptId,'call-a')
 assert.equal((await getTurnCost(ledger,ctx,'s',1,4)).cost,expected)
 assert.equal(billingStatistics(ledger,{from:'2026-10-21',to:'2026-10-21'}).totals.cost,expected)
 const projection=__testProjection.makeCostUsageProjection(ledger),state=projection.init({id:'s',createdAt:at},0);assert.equal(projection.view(state).cost,expected);assert.equal(projection.wire.view(state).cost,expected)
})
test('two concurrent ledger writers retain every receipt and legacy totals',t=>{
 const a=fixture(t,true),b=Ledger.load(a.path);t.after(()=>b.close());a.account({input:1e6},'m','s',at+10,'p',{id:'a'});b.account({input:1e6},'m','s',at+11,'p',{id:'b'});a.refresh();assert.equal(a.sumDays('').calls,10);assert.equal(a.sumDays('').cost,26.4)
 const samples=billingSamples(a,'s');assert.equal(samples.filter(x=>x.kind==='legacy').length,1);assert.equal(costFromSamples(samples,a.config).representedCalls,10)
})
test('complete, interrupted, missing-usage and nested streams each record one actual request',async t=>{
 const ledger=fixture(t),rows=[];let time=at
 const listener=createLlmStreamBilling({now:()=>++time,account:(u,m,s,when,p,meta)=>{rows.push(meta);ledger.account({input:u.inputTokens??0,output:u.outputTokens??0,billingCallId:u.billingCallId},m,s,when,p,meta)}})
 const options={provider:'p',model:'m',sessionId:'s',purpose:'reply-suggestion'}
 let id
 for await(const chunk of listener(options,async function*(){yield {type:'usage',usage:{inputTokens:1e6,outputTokens:0}};yield {type:'finish',reason:{kind:'stop'}}})){if(chunk.type==='usage')id=chunk.usage.billingCallId;if(chunk.type==='finish')assert.equal(ledger.sumDays('').calls,1)}
 assert.equal(Object.values(ledger.days['2026-10-21'].receipts)[0].id,id)
 for await(const _ of listener(options,async function*(){yield {type:'usage',usage:{inputTokens:1e6,outputTokens:0}};yield {type:'text-delta',text:'x'}}))break
 await assert.rejects(async()=>{for await(const _ of listener(options,async function*(){throw Error('offline')})){}},/offline/)
 for await(const _ of listener(options,async function*(){yield* listener(options,async function*(){yield {type:'usage',usage:{inputTokens:1e6,outputTokens:0}}})})){}
 assert.equal(ledger.sumDays('').calls,4);assert.equal(ledger.sumDays('').unpricedCalls,1);assert.equal(rows[1].outcome,'interrupted');assert.equal(rows[2].usageMissing,true);assert.equal(rows[0].kind,'reply-suggestion')
})
test('a failed ledger write retains the original receipt for retry without counting it twice',t=>{
 const ledger=fixture(t),read=ledger.readDiskSnapshot.bind(ledger);let fail=true;ledger.readDiskSnapshot=()=>{if(fail)throw Error('simulated storage outage');return read()}
 ledger.account({input:1e6},'m','s',at+10,'p',{id:'retry'});assert.equal(ledger.pendingWrite,true);assert.ok(ledger.lastWriteError)
 fail=false;ledger.flush();ledger.account({input:1e6},'m','s',at+10,'p',{id:'retry'});assert.equal(ledger.pendingWrite,false);assert.equal(ledger.lastWriteError,null);assert.equal(ledger.sumDays('').calls,1)
})
