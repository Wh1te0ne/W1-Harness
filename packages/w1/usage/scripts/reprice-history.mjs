import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {sessionBillingRecords,replaySessionRecords} from '../lib/backfill.js'
import {fetchSource,SOURCE_BINDINGS} from '../lib/price-sources.js'
import {repriceHistoricalLedger,applyHistoricalRepricing,REPRICING_ID} from '../lib/historical-repricing.js'

const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1]
if(!args.includes('--ledger')||!args.includes('--plan'))throw Error('Required: --ledger <file> --plan <private file> --preview|--apply')
const path=resolve(option('--ledger')),planPath=resolve(option('--plan'))
if(args.includes('--apply')){
  const plan=JSON.parse(readFileSync(planPath,'utf8'))
  if(plan.ledgerPath!==path)throw Error('Preview belongs to another ledger')
  console.log(JSON.stringify(applyHistoricalRepricing(path,plan)));process.exit(0)
}
if(!args.includes('--preview')||!args.includes('--sessions'))throw Error('Preview requires --sessions <directory>')
const ledger=JSON.parse(readFileSync(path,'utf8'))
if(ledger.config.prices.book.audit?.id===REPRICING_ID)throw Error('Already repriced; do not create another correction')
const at=Date.now(),book=ledger.config.prices.book,quotes={},catalogs={},samples={}
const keys=new Set(Object.values({...ledger.archivedDays,...ledger.days}).flatMap(d=>Object.keys(d.byProviderModel??{})))
for(const key of keys){
  const provider=key.slice(0,key.indexOf(':')),model=key.slice(key.indexOf(':')+1)
  const matching=book.records.filter(r=>r.key===key&&r.rate)
  const record=matching.findLast(r=>r.to===null)??matching.at(-1)
  if(!record)throw Error('Missing exact price: '+key)
  const quote=structuredClone(record)
  if(record.to!==null)quote.note='已删除型号，使用该渠道留存的最后有效价格；不恢复价格配置'
  const source=book.sources?.[provider]?.sourceId??SOURCE_BINDINGS[provider]
  if(record.mode==='auto'&&source){
    if(!catalogs[source]){try{catalogs[source]=await fetchSource(source,{holidays:record.rate.peakPricing?.holidays??[],now:at})}catch(error){catalogs[source]={error:error.message}}}
    const catalog=catalogs[source],rate=catalog.models?.[model]
    if(rate){quote.rate=structuredClone(rate);quote.sourceUrl=catalog.sourceUrl;quote.sourceVersion=catalog.version;quote.checkedAt=new Date(at).toISOString()}
    else quote.note='价格来源未返回此型号或暂时不可用，按同渠道同型号留存价格估算'
  }
  quotes[key]=quote
}
const ids=new Set(Object.values(ledger.days).flatMap(d=>(d.sessions??[]).map(s=>s.id)))
for await(const records of sessionBillingRecords({path},resolve(option('--sessions')),ids)){
  if(!records)continue
  const replay=replaySessionRecords(records,ledger.config,null,true)
  const receiptIds=new Map(records.map(r=>[r.seq,r.data?.usage?.billingCallId??r.data?.chunk?.usage?.billingCallId]))
  for(const sample of replay.samples){if(sample.seed)continue;const key=JSON.stringify([sample.date,replay.sessionId,sample.providerKey]);(samples[key]??=[]).push({...sample,receiptId:receiptIds.get(sample.logSeq)})}
}
const plan={ledgerPath:path,...repriceHistoricalLedger(ledger,samples,quotes,{at})}
mkdirSync(dirname(planPath),{recursive:true});writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx'})
const reportPath=planPath.replace(/\.json$/,'')+'-summary.md'
const r=plan.report,fmt=n=>n.toFixed(6)
const lines=['# 历史消费重算对账','',`核算时间：${new Date(at).toISOString()}。币种：人民币。`,
  `重算前 ¥${fmt(r.before)}；重算后 ¥${fmt(r.after)}；差额 ¥${fmt(r.delta)}。`,
  `原记录 ${r.calls} 次调用；重算 ${r.repricedCalls} 次；保留独立凭据 ${r.fixedReceiptCalls} 次。`,'',
  '本次采用核对时的各渠道价格统一估算旧账，不声称还原供应商历史实付金额。Token 总量和调用次数保持原记录。',
  '有日志按实际时间、上下文和缓存分类；不完全匹配时按各类 Token 的日志档位比例分摊；无日志按单次平均上下文、当天峰谷时长加权。缺少写入时长按普通写入，缺少 effort 按 1 倍；全无用量按同渠道同型号平均调用估费。','',
  '| Provider | 调用 | 修正前 | 修正后 | 差额 |','|---|---:|---:|---:|---:|',
  ...Object.entries(r.providers).map(([key,p])=>`| ${key} | ${p.calls} | ${fmt(p.before)} | ${fmt(p.after)} | ${fmt(p.delta)} |`),'',
  '| 日期 | Provider / 模型 | 调用 | 修正前 | 修正后 | 差额 | 估算说明 |','|---|---|---:|---:|---:|---:|---|',
  ...r.rows.map(row=>`| ${row.date} | ${row.key} | ${row.calls} | ${fmt(row.before)} | ${fmt(row.after)} | ${fmt(row.delta)} | ${row.notes.slice(1).join('；')||'逐次日志完整；按本次核对价格重算'} |`)]
writeFileSync(reportPath,lines.join('\n')+'\n',{flag:'wx'})
console.log(JSON.stringify({planPath,reportPath,before:r.before,after:r.after,delta:r.delta,groups:r.groups,calls:r.calls,providers:r.providers}))
