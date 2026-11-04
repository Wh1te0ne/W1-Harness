import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {applyAccount} from '../lib/ledger-persistence.js'
import {repriceHistoricalLedger,applyHistoricalRepricing,REPRICING_ID} from '../lib/historical-repricing.js'
import {defaultPeakRule} from '../lib/price-book.js'
import {auditHistoricalPricing} from '../lib/pricing-audit.js'
const at=Date.parse('2026-10-21T08:00:00Z'),date='2026-10-21'
const rate={currency:'CNY',input:3,cachedInput:.3,output:15,cacheWrite:4,cacheWrite1h:6}
const fields=['input','output','cacheRead','cacheWrite','cacheWrite1h','reasoning','calls','cost','apiCost','unpricedCalls','estimatedCalls','stalePriceCalls']
function state(){return {version:1,config:{prices:{book:{version:1,revision:1,records:[],fx:[{at:0,rate:7,date}],audit:{status:'normalized'}}}},days:{},archivedDays:{},planHourBuckets:{}}}
function add(s,key,values={},extra={}){applyAccount(s,{date,sessionId:'s',atMs:at,providerKey:key,planId:null,values:{...Object.fromEntries(fields.map(f=>[f,0])),calls:1,cost:1,apiCost:1,...values},...extra})}
const quotes=(key,r=rate)=>({[key]:{id:key,key,rate:r,source:'manual'}})
const sample=(tokens,when=at,parameters)=>({buckets:tokens,atMs:when,billingParameters:parameters})
const group=(key,items)=>({[JSON.stringify([date,'s',key])]:items})
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
test('exact provider quotes, five fee items and actual long-context/effort apply to calls, not daily length',()=>{
 const s=state(),key='enterprise:m',r={...rate,effortMultiplier:2,longContext:{aboveInputTokens:100,input:6,cachedInput:.6,output:25,cacheWrite:8,cacheWrite1h:12}}
 const a={input:40,output:10,cacheRead:20,cacheWrite:30,cacheWrite1h:20,reasoning:0},b={input:200,output:10,cacheRead:20,cacheWrite:30,cacheWrite1h:20,reasoning:0}
 add(s,key,a);add(s,key,b);add(s,'default:m',{input:1e6})
 const plan=repriceHistoricalLedger(s,group(key,[sample(a,at,{outputConfigEffort:null}),sample(b,at,{outputConfigEffort:'max'})]),{...quotes(key,r),...quotes('default:m',{...rate,input:1})},{at})
 near(plan.next.days[date].sessions[0].byProviderModel[key].cost,(40*3+10*15+20*.3+10*4+20*6+(200*6+10*25+20*.6+10*8+20*12)*2)/1e6)
 near(plan.next.days[date].byProviderModel['default:m'].cost,1)
 assert.equal(plan.next.days[date].calls,3);assert.equal(plan.report.repricedCalls,3)
})
test('missing logs use daily peak duration and average per-call context; unknown writes use normal duration',()=>{
 const s=state(),key='official:m';add(s,key,{input:2e6,cacheWrite:1e6,calls:20})
 const r={...rate,offPeak:{...rate},peak:{...rate,input:6,cacheWrite:8},peakPricing:defaultPeakRule(),longContext:{aboveInputTokens:200000,input:100,cachedInput:100,output:100,cacheWrite:100}}
 const plan=repriceHistoricalLedger(s,{},quotes(key,r),{at})
 near(plan.report.after,(2*3+4)*17/24+(2*6+8)*7/24)
 assert.ok(plan.report.rows[0].notes.some(n=>n.includes('普通写入')))
})
test('incomplete logs scale each token field to original aggregates without changing token counts',()=>{
 const s=state(),key='p:m';add(s,key,{input:100,output:20,calls:3})
 const plan=repriceHistoricalLedger(s,group(key,[sample({input:50,output:5})]),quotes(key),{at})
 near(plan.report.after,(100*3+20*15)/1e6);assert.equal(plan.next.days[date].input,100)
 assert.equal(plan.report.rows[0].logCalls,1)
})
test('missing all tokens estimates fees using the same provider/model only and retains reported zero tokens',()=>{
 const s=state();add(s,'p:m',{input:1e6,calls:2});add(s,'p:m',{calls:1},{sessionId:'missing'})
 const plan=repriceHistoricalLedger(s,{},quotes('p:m'),{at});near(plan.report.after,4.5)
 assert.equal(plan.next.days[date].input,1e6);assert.equal(plan.next.days[date].calls,3)
 assert.throws(()=>repriceHistoricalLedger(s,{},quotes('other:m'),{at}),/exact provider/)
})
test('receipts stay byte-identical, archived and anonymous aggregates reconcile with all totals',()=>{
 const s=state(),key='p:m';add(s,key,{input:1e6});add(s,key,{input:1e6,cost:9,apiCost:9},{id:'fixed',tokens:{input:1e6},pricing:{entry:{cacheMiss:9}}});add(s,key,{input:1e6},{sessionId:null})
 const old=JSON.stringify(s.days[date].receipts)
 s.archivedDays['2026-10-20']={...structuredClone(s.days[date]),date:'2026-10-20',sessions:[],receipts:{},input:1e6,calls:1,cost:1,apiCost:1,byProviderModel:{[key]:{input:1e6,calls:1,cost:1,apiCost:1}}}
 const plan=repriceHistoricalLedger(s,{},quotes(key),{at})
 assert.equal(JSON.stringify(plan.next.days[date].receipts),old);near(plan.next.days[date].cost,15);near(plan.next.archivedDays['2026-10-20'].cost,3)
 assert.equal(plan.report.fixedReceiptCalls,1);assert.equal(plan.report.repricedCalls,3)
})
test('apply backs up, rejects stale snapshots, is idempotent, and prevents the old audit from running',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'w1-reprice-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'ledger.json'),s=state();add(s,'p:m',{input:1e6})
 const plan=repriceHistoricalLedger(s,{},quotes('p:m'),{at});writeFileSync(path,JSON.stringify({...s,balanceRef:42}))
 assert.throws(()=>applyHistoricalRepricing(path,plan),/changed after preview/)
 writeFileSync(path,JSON.stringify(s));const audit=applyHistoricalRepricing(path,plan);assert.equal(audit.id,REPRICING_ID)
 assert.deepEqual(JSON.parse(readFileSync(audit.backup)),s);assert.deepEqual(applyHistoricalRepricing(path,plan),audit)
 const updated=JSON.parse(readFileSync(path));near(updated.days[date].cost,3)
 assert.deepEqual(await auditHistoricalPricing({config:updated.config},'/no-sessions'),audit)
})
