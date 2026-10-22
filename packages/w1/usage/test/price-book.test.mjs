import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {tmpdir} from 'node:os'
import {defaultConfig,Ledger} from '../lib/store.js'
import {createPriceBook,changePriceBook,resolveBookPrice,defaultPeakRule,validPriceBook} from '../lib/price-book.js'
import {providerPriceEntryFor,costOf} from '../lib/pricing.js'
import {migrateLedgerCny} from '../lib/pricing-migration.js'
import {fetchUsdCny} from '../lib/exchange-rate.js'
import {createLlmStreamBilling} from '../lib/billing-stream.js'
import {auditHistoricalPricing} from '../lib/pricing-audit.js'
import {wawaPricePreset} from '../lib/wawa-prices.js'
import {mkdirSync} from 'node:fs'
import {stateSchema,billingStatisticsSchema,TYPERT} from '../lib/typert.host.js'
import {billingStatistics} from '../lib/billing-statistics.js'
const rate=(input,currency='CNY')=>({currency,input,cachedInput:0,output:0})
const create=()=>createPriceBook(defaultConfig(),1000)
const change=(book,action,at)=>changePriceBook(book,{revision:book.revision,...action},at)
const cost=(book,key,at)=>{const i=key.indexOf(':'),r=resolveBookPrice(key.slice(0,i),key.slice(i+1),{book},at);return r.priced?costOf({input:1e6},r.entry,at,{}):null}

test('archiving clears only the retired model warning and late synchronization cannot restore it',()=>{
 let book=change(create(),{type:'source-mode',provider:'p',sourceId:'openrouter'},2000)
 book=change(book,{type:'sync-result',provider:'p',models:{'p:m':rate(2)},issues:{}},3000)
 const record=book.records.findLast(r=>r.key==='p:m')
 book=change(book,{type:'sync-result',provider:'p',models:{},issues:{'p:m':'missing'}},4000)
 assert.equal(book.sync.p.status,'partial')
 book=change(book,{type:'delete',id:record.id},5000)
 assert.equal(book.sync.p.status,'ok');assert.deepEqual(book.sync.p.issues,{})
 assert.equal(cost(book,'p:m',3500),2);assert.equal(cost(book,'p:m',5500),null)
 assert.equal(book.syncHistory.p.find(r=>r.at===4000).issues['p:m'],'missing')
 book=change(book,{type:'sync-result',provider:'p',models:{'p:m':rate(9)},issues:{'p:m':'late missing','p:other':'still missing'}},6000)
 assert.deepEqual(book.sync.p.issues,{'p:other':'still missing'});assert.equal(book.sync.p.status,'partial')
 assert.equal(book.records.filter(r=>r.key==='p:m').length,1);assert.equal(cost(book,'p:m',6500),null)
})
test('delete/recreate/repeated equal prices keep separate immutable histories',()=>{
 let book=change(create(),{type:'save',key:'a:model',rate:rate(10)},2000)
 const first=book.records.at(-1).id
 book=change(book,{type:'delete',id:first},3000)
 assert.equal(cost(book,'a:model',2500),10);assert.equal(cost(book,'a:model',3000),null)
 book=change(book,{type:'save',key:'a:model',rate:rate(20)},4000)
 const second=book.records.at(-1).id
 book=change(book,{type:'delete',id:second},5000)
 book=change(book,{type:'save',key:'a:model',rate:rate(20)},6000)
 assert.notEqual(book.records.at(-1).id,second)
 assert.equal(cost(book,'a:model',4500),20);assert.equal(cost(book,'a:model',5500),null);assert.equal(cost(book,'a:model',6500),20)
 assert.equal(book.records.filter(r=>r.deletedAt!==null).length,2)
 assert.throws(()=>change(book,{type:'restore',id:first},7000),/已有有效价格/)
 assert.equal(cost(book,'a:model',2500),10)
})
test('restore creates a new effective period without filling the deleted gap',()=>{
 let book=change(create(),{type:'save',key:'a:model',rate:rate(10)},2000),first=book.records.at(-1).id
 book=change(book,{type:'delete',id:first},3000);book=change(book,{type:'restore',id:first},5000)
 assert.equal(cost(book,'a:model',4000),null);assert.equal(cost(book,'a:model',6000),10)
 assert.notEqual(book.records.at(-1).id,first);assert.equal(book.records.find(r=>r.id===first).deletedAt,3000)
})
test('FX changes only affect subsequent USD calls and never CNY calls',()=>{
 let book=change(create(),{type:'save',key:'usd:m',rate:rate(1,'USD')},2000)
 book=change(book,{type:'save',key:'cny:m',rate:rate(10)},2000)
 book=change(book,{type:'fx',mode:'manual',rate:8},3000)
 assert.equal(cost(book,'usd:m',2500),7.2);assert.equal(cost(book,'usd:m',3500),8)
 assert.equal(cost(book,'cny:m',2500),10);assert.equal(cost(book,'cny:m',3500),10)
 assert.throws(()=>changePriceBook(book,{type:'fx',mode:'manual',rate:9,revision:0},4000),/其他页面/)
})
test('per-model peak periods use Beijing completion time, boundaries and provider holidays',()=>{
 let book=create(),rule=defaultPeakRule('volcengine'),r={...rate(1),offPeak:rate(1),peak:rate(2),peakPricing:rule}
 book=change(book,{type:'save',key:'v:flash',rate:r},2000)
 for(const [time,expected] of [['2026-10-21T00:59:59Z',1],['2026-10-21T01:00:00Z',2],['2026-10-21T04:00:00Z',1],['2026-10-24T01:00:00Z',1]])assert.equal(cost(book,'v:flash',Date.parse(time)),expected)
 r.peakPricing={...rule,preset:'deepseek',holidays:['2026-10-21']}
 book=change(book,{type:'save',key:'d:flash',rate:r},2000)
 assert.equal(cost(book,'d:flash',Date.parse('2026-10-21T01:00Z')),1)
})
test('only exact provider/model records price calls; OpenRouter cannot reprice manual or deleted rows',()=>{
 let book=create()
 assert.equal(cost(book,'vx:deepseek-flash',2500),null)
 book=change(book,{type:'save',key:'openrouter:model',rate:rate(10)},2000)
 const manual=book.records.at(-1)
 book=change(book,{type:'official-api',keys:['openrouter:model','vx:model'],models:{model:{cacheMiss:1,cacheHit:0,output:0}}},3000)
 assert.equal(cost(book,'openrouter:model',3500),10);assert.equal(cost(book,'vx:model',3500),null)
 book=change(book,{type:'delete',id:manual.id},4000)
 book=change(book,{type:'official-api',keys:['openrouter:model'],models:{model:{cacheMiss:1,cacheHit:0,output:0}}},5000)
 assert.equal(cost(book,'openrouter:model',5500),null)
})
test('official API refresh creates dated versions, not retroactive price replacements',()=>{
 let book=create()
 const update=(price,at)=>{book=change(book,{type:'official-api',keys:['openrouter:model'],models:{model:{cacheMiss:price,cacheHit:0,output:0}}},at)}
 update(1,2000);update(2,3000)
 assert.equal(cost(book,'openrouter:model',2500),7.2);assert.equal(cost(book,'openrouter:model',3500),14.4)
 const count=book.records.length;update(2,4000);assert.equal(book.records.length,count)
})
test('currency migration backs up once, retains displayed CNY and persists historical rate versions',t=>{
 const dir=mkdtempSync(join(tmpdir(),'w1-book-'));t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'w1-book-'));rmSync(dir,{recursive:true,force:true})})
 const path=join(dir,'ledger.json'),config=defaultConfig();config.prices.manual={'a:model':rate(10)}
 const values={input:1e6,output:0,cacheRead:0,cacheWrite:0,reasoning:0,calls:1,cost:2,apiCost:2}
 const raw={version:1,config,days:{'2026-10-20':{date:'2026-10-20',...values,byProviderModel:{'a:model':{...values}},sessions:[]}}}
 writeFileSync(path,JSON.stringify(raw));assert.equal(migrateLedgerCny(path,2000),true)
 assert.equal(migrateLedgerCny(path,3000),false)
 assert.equal(readdirSync(join(dir,'pricing-backups')).length,1)
 const after=JSON.parse(readFileSync(path));assert.equal(after.days['2026-10-20'].cost,14.4);assert.equal(after.config.exchangeRate,1)
 const ledger=Ledger.load(path)
 const before=ledger.sumDays('').cost
 ledger.account({input:1e6},'model','session',2500,'a');ledger.flush()
 ledger.updatePricing({type:'fx',mode:'manual',rate:8,revision:ledger.config.prices.book.revision},3000)
 assert.equal(ledger.sumDays('').cost,before+10)
 const id=ledger.config.prices.book.records.find(r=>r.key==='a:model').id
 ledger.updatePricing({type:'delete',id,revision:ledger.config.prices.book.revision},4000)
 ledger.account({input:1e6},'model','session',4500,'a');ledger.close()
 const reopened=Ledger.load(path)
 assert.equal(reopened.sumDays('').cost,before+10)
 assert.equal(reopened.sumDays('').unpricedCalls,1)
 assert.equal(providerPriceEntryFor('a','model',reopened.config.prices,{atMs:2500}).entry.cacheMiss,10)
 reopened.close()
})
test('FX provider validation rejects failure, wrong pair and invalid values',async()=>{
 assert.deepEqual(await fetchUsdCny(async()=>({ok:true,json:async()=>({base:'USD',quote:'CNY',rate:7,date:'2026-10-20'})})),{rate:7,date:'2026-10-20',source:'Frankfurter / ECB'})
 for(const data of [{base:'USD',quote:'EUR',rate:7,date:'2026-10-20'},{base:'USD',quote:'CNY',rate:0,date:'2026-10-20'}])await assert.rejects(fetchUsdCny(async()=>({ok:true,json:async()=>data})),/无效/)
 await assert.rejects(fetchUsdCny(async()=>({ok:false})),/保留/)
 await assert.rejects(fetchUsdCny(async()=>({ok:true,json:async()=>({base:'USD',quote:'CNY',rate:7,date:'2026-99-99'})})),/无效/)
})

test('price keys, clocks and RPC codecs preserve exact versioned records',()=>{
 const book=create()
 assert.throws(()=>change(book,{type:'save',key:'LLM-A:model',rate:rate(1)},2000),/有效/)
 assert.throws(()=>change(book,{type:'fx',mode:'manual',rate:7},999),/系统时间/)
 const config=defaultConfig();config.prices.book=book
 const decoded=stateSchema.shape.config.parse(config)
 assert.deepEqual(decoded.prices.book,book)
 const invocation=TYPERT.invocations.find(r=>r.method==='pricingAction')
 assert.ok(invocation)
 const ledger={config,days:{'2026-10-21':{date:'2026-10-21',input:10,calls:1,unpricedCalls:1,cost:0,apiCost:0,byProviderModel:{'a:unknown':{input:10,calls:1,unpricedCalls:1,cost:0,apiCost:0}},sessions:[]}},archivedDays:{}}
 const stats=billingStatisticsSchema.parse(billingStatistics(ledger,{from:'2026-10-21',to:'2026-10-21'}))
 assert.equal(stats.totals.unpricedCalls,1);assert.equal(stats.models[0].priced,false)
})

test('stream accounting captures completion time exactly once even across a tariff boundary',async()=>{
 let now=Date.parse('2026-10-21T00:59:00Z');const calls=[]
 const listener=createLlmStreamBilling({now:()=>now,account:(...args)=>calls.push(args)})
 const stream=listener({model:'m',provider:'a',sessionId:'s'},async function*(){yield {type:'usage',usage:{inputTokens:100}};now=Date.parse('2026-10-21T01:01:00Z')})
 for await(const _ of stream){}
 assert.equal(calls.length,1);assert.equal(calls[0][3],now)
})

test('historical audit repairs fully matched known tariffs once and preserves unresolved records',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'w1-audit-'));t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'w1-audit-'));rmSync(dir,{recursive:true,force:true})})
 const home=join(dir,'sessions','project','s');mkdirSync(home,{recursive:true})
 const at=Date.parse('2026-10-14T08:00Z'),activated=Date.parse('2026-10-21T08:00Z'),key='wawa-zz-gemini:gemini-4-argon'
 const config=defaultConfig();config.prices.manual=wawaPricePreset([{provider:'wawa-zz-gemini',model:'gemini-4-argon'}]);config.prices.book=createPriceBook(config,activated);config.exchangeRate=1
 const values={input:1e6,output:0,cacheRead:0,cacheWrite:0,reasoning:0,calls:1,cost:0,apiCost:0}
 const day={date:'2026-10-14',...values,byProviderModel:{[key]:{...values}},sessions:[{id:'s',...values,byProviderModel:{[key]:{...values}}}]}
 const path=join(dir,'ledger.json');writeFileSync(path,JSON.stringify({version:1,config,days:{'2026-10-14':day}}))
 const events=[{type:'session',id:'s',createdAt:at-1000},{type:'request/header',time:at-500,seq:1,data:{header:{config:{provider:'wawa-zz-gemini',model:'gemini-4-argon'}}}},{type:'assistant/message',time:at,seq:2,data:{turn:1,step:0,usage:{inputTokens:1e6,outputTokens:0}}}]
 writeFileSync(join(home,'session.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n')
 const ledger=Ledger.load(path)
 const preview=await auditHistoricalPricing(ledger,join(dir,'sessions'))
 assert.equal(preview.verified,1);assert.equal(preview.deltaCny,.5);assert.equal(ledger.sumDays('').cost,0)
 // Emulate another day's live call arriving after the scan; the repair must not replace it.
 const read=ledger.readDiskSnapshot.bind(ledger)
 ledger.readDiskSnapshot=()=>{const disk=read();disk.days['2026-10-21']={date:'2026-10-21',...values,cost:9,apiCost:9,byProviderModel:{[key]:{...values,cost:9,apiCost:9}},sessions:[]};return disk}
 const result=await auditHistoricalPricing(ledger,join(dir,'sessions'),{apply:true})
 assert.equal(result.applied,true);assert.equal(ledger.sumDays('').cost,9.5)
 const repeated=await auditHistoricalPricing(ledger,join(dir,'sessions'),{apply:true})
 assert.equal(repeated.id,result.id);assert.equal(ledger.sumDays('').cost,9.5)
 assert.equal(providerPriceEntryFor('wawa-zz-gemini','gemini-4-argon',ledger.config.prices,{atMs:at}).entry.cacheMiss,.5)
 ledger.close()
})
