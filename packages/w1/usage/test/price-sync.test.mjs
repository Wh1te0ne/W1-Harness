import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {parseVxTariff,parseVxCatalog} from '../lib/vx-pricing.js'
import {parseSource} from '../lib/price-sources.js'
import {createPriceBook,changePriceBook,resolveBookPrice} from '../lib/price-book.js'
import {createPriceSync} from '../lib/price-sync.js'
import {defaultConfig,Ledger} from '../lib/store.js'
import {providerPriceEntryFor,costOf} from '../lib/pricing.js'
import {replaySessionRecords} from '../lib/backfill.js'
import {costFromSamples} from '../lib/turn-cost.js'
import {billingStatistics} from '../lib/billing-statistics.js'
import {billingStatisticsSchema} from '../lib/typert.host.js'
const at=Date.parse('2026-10-21T06:00Z'), expression='tier("base", p * 3.15 + c * 16.8 + cr * 0.41 + cc * 4.1 + cc1h * 6.3)'
const config=()=>{const c=defaultConfig();c.prices.book=createPriceBook(c,at);c.exchangeRate=1;return c}
const change=(book,action,time=at)=>changePriceBook(book,{revision:book.revision,...action},time)
const catalog={success:true,pricing_version:1,group_ratio:{default:1,'GPT/Claude高档货':1,'GPT/Claude企业级MAX':1},data:[{model_name:'m',enable_groups:['default'],billing_mode:'tiered_expr',billing_expr:expression},{model_name:'m-high',enable_groups:['GPT/Claude高档货'],billing_mode:'tiered_expr',billing_expr:expression},{model_name:'m-max',enable_groups:['GPT/Claude企业级MAX'],billing_mode:'tiered_expr',billing_expr:expression}]}
function fixture(t,c=config()){
 const dir=mkdtempSync(join(tmpdir(),'w1-sync-'));t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'w1-sync-'));rmSync(dir,{recursive:true,force:true})})
 const path=join(dir,'ledger.json');writeFileSync(path,JSON.stringify({version:1,config:c,days:{}}));const ledger=Ledger.load(path);t.after(()=>ledger.close());return ledger
}
test('VX precise groups and unsupported/duplicate formulas fail closed',()=>{
 for(const [group,id]of[['default','m'],['GPT/Claude高档货','m-high'],['GPT/Claude企业级MAX','m-max']])assert.deepEqual(Object.keys(parseVxCatalog(catalog,group).models),[id])
 assert.throws(()=>parseVxTariff('process.exit()'));assert.throws(()=>parseVxTariff('tier("base", p * 1)'))
 const bad=structuredClone(catalog);bad.data.push({...bad.data[0]});assert.throws(()=>parseVxCatalog(bad,'default'))
 assert.throws(()=>parseSource('vx-default','{"success":true,"data":[]}'))
})
test('all five fee buckets, context boundaries and effort use real per-call values',()=>{
 const c=config(),key='vx-api-enterprise:m-max';const rate=parseVxTariff(`(${expression}) * (param("output_config.effort") == "max" ? 2 : 1)`)
 c.prices.book=change(c.prices.book,{type:'save',key,rate})
 const tokens={input:1e6,output:1e6,cacheRead:1e6,cacheWrite:2e6,cacheWrite1h:1e6}
 const resolve=(parameters)=>providerPriceEntryFor('vx-api-enterprise','m-max',c.prices,{atMs:at,tokens,billingParameters:parameters})
 assert.equal(resolve().priced,false)
 assert.equal(costOf(tokens,resolve({outputConfigEffort:null}).entry,at,{}),30.76)
 assert.equal(costOf(tokens,resolve({outputConfigEffort:'max'}).entry,at,{}),61.52)
 const short=parseVxTariff('len <= 272000 ? tier("s", p * 1 + c * 2) : tier("l", p * 3 + c * 4)')
 const strict=parseVxTariff('len < 272000 ? tier("s", p * 1 + c * 2) : tier("l", p * 3 + c * 4)')
 for(const[r,expected]of[[short,.272],[strict,.816]]){c.prices.book=change(c.prices.book,{type:'save',key:'p:t',rate:r,expectedId:c.prices.book.records.findLast(x=>x.key==='p:t'&&x.to===null)?.id});const e=resolveBookPrice('p','t',c.prices,at);assert.equal(costOf({input:272000},e.entry,at,{}),expected)}
 const missing={...tokens};delete missing.cacheWrite1h
 assert.equal(providerPriceEntryFor('vx-api-enterprise','m-max',c.prices,{atMs:at,tokens:missing,billingParameters:{outputConfigEffort:null}}).estimated,true)
})
test('ledger persistence, session replay, detail and RPC totals retain split write costs',t=>{
 const c=config();c.prices.book=change(c.prices.book,{type:'save',key:'vx-api-high:m-high',rate:parseVxTariff(expression)})
 const ledger=fixture(t,c),tokens={input:1e6,output:1e6,cacheRead:1e6,cacheWrite:2e6,cacheWrite1h:1e6}
 ledger.account(tokens,'m-high','s',at+1000,'vx-api-high');ledger.flush();ledger.refresh()
 assert.equal(ledger.sumDays('').cost,30.76);assert.equal(ledger.sumDays('').cacheWrite1h,1e6)
 const events=[{type:'session',id:'s',createdAt:at},{type:'request/header',time:at,seq:1,data:{header:{config:{provider:'vx-api-high',model:'m-high'}}}},{type:'assistant/message',time:at+1000,seq:2,data:{turn:1,step:0,usage:{inputTokens:1e6,outputTokens:1e6,cacheReadTokens:1e6,cacheWriteTokens:2e6,cacheWrite1hTokens:1e6}}}]
 const {samples}=replaySessionRecords(events,c,null,true),detail=costFromSamples(samples,c)
 assert.equal(detail.cost,30.76);assert.equal(detail.rows.find(r=>r.bucket==='cacheWrite1h').cost,6.3)
 assert.equal(detail.rows.find(r=>r.bucket==='cacheWrite').cost,4.1)
 const stats=billingStatisticsSchema.parse(billingStatistics(ledger,{from:'2026-10-21',to:'2026-10-21'}));assert.equal(stats.totals.cacheWrite1h,1e6);assert.equal(stats.totals.cost,30.76)
})
test('sync preserves manual locks and deleted records; High gets separate source; failure keeps last price and historic status',async t=>{
 const c=config(),ledger=fixture(t,c);let time=at+1000,fail=false
 const sync=createPriceSync(ledger,{now:()=>time,models:async()=>[{provider:'vx-api-default',model:'m'},{provider:'vx-api-high',model:'m-high'}],fetcher:async()=>fail?new Response('oops',{status:503}):new Response(JSON.stringify(catalog))});t.after(()=>sync.dispose())
 await sync.refresh('vx-api-high',true);let b=ledger.config.prices.book
 assert.equal(b.sources['vx-api-high'].sourceId,'vx-high');assert.equal(resolveBookPrice('vx-api-high','m-high',{book:b},time).entry.cacheMiss,3.15)
 const priceId=b.records.at(-1).id;time+=1000;fail=true;await sync.refresh('vx-api-high',true);b=ledger.config.prices.book
 assert.equal(b.sync['vx-api-high'].status,'error');assert.equal(b.records.at(-1).id,priceId)
 assert.equal(resolveBookPrice('vx-api-high','m-high',{book:b},at+1500).stale,false);assert.equal(resolveBookPrice('vx-api-high','m-high',{book:b},time).stale,true)
 time+=1000;fail=false;await sync.refresh('vx-api-high',true);b=ledger.config.prices.book
 assert.equal(resolveBookPrice('vx-api-high','m-high',{book:b},at+2500).stale,true);assert.equal(resolveBookPrice('vx-api-high','m-high',{book:b},time).stale,false)
 ledger.updatePricing({revision:b.revision,type:'save',key:'vx-api-high:m-high',expectedId:priceId,rate:{currency:'CNY',input:99,cachedInput:0,output:0}},++time)
 await sync.refresh('vx-api-high',true);b=ledger.config.prices.book;assert.equal(resolveBookPrice('vx-api-high','m-high',{book:b},time).entry.cacheMiss,99)
 ledger.updatePricing({revision:b.revision,type:'delete',id:b.records.at(-1).id},++time);await sync.refresh('vx-api-high',true)
 assert.equal(resolveBookPrice('vx-api-high','m-high',ledger.config.prices,time).priced,false)
})
test('automatic FX failure is visible, retries after backoff and never changes old CNY',async t=>{
 const c=config();c.prices.book=change(c.prices.book,{type:'save',key:'usd:m',rate:{currency:'USD',input:1,cachedInput:0,output:0}});c.prices.book=change(c.prices.book,{type:'fx-mode',mode:'auto'})
 const ledger=fixture(t,c);let time=at+1000,fail=true,calls=0
 const sync=createPriceSync(ledger,{models:async()=>[],now:()=>time,fetcher:async()=>{calls++;return fail?new Response('failed',{status:503}):new Response(JSON.stringify({date:'2026-10-21',base:'USD',quote:'CNY',rate:7}))}});t.after(()=>sync.dispose())
 await sync.refreshFx();assert.equal(ledger.config.prices.book.fxStatus.status,'error');await sync.refreshFx();assert.equal(calls,1)
 time+=3600000;fail=false;await sync.refreshFx();assert.equal(ledger.config.prices.book.fxStatus.status,'ok')
 assert.equal(resolveBookPrice('usd','m',ledger.config.prices,at).entry.cacheMiss,7.2);assert.equal(resolveBookPrice('usd','m',ledger.config.prices,time).entry.cacheMiss,7)
})
