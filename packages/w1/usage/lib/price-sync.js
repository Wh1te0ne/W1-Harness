import {PRICE_SOURCES,SOURCE_BINDINGS,fetchSource} from './price-sources.js'
import {fetchUsdCny} from './exchange-rate.js'
import {pricingKey} from './price-book.js'

/** One coordinator per ledger. All publication uses the ledger's lock and current revision. */
export function createPriceSync(ledger,{models,fetcher=fetch,now=Date.now}={}){
  const pending=new Map();let active=true
  const change=action=>{ledger.refresh();return ledger.updatePricing({revision:ledger.config.prices.book.revision,...action},now())}
  async function initialize(){
    const routes=await models(),book=ledger.config.prices.book
    const providers=new Set([...routes.map(r=>r.provider.replace(/^llm-/,'')),...book.records.map(r=>r.key.split(':')[0])])
    const bindings=Object.fromEntries([...providers].filter(p=>SOURCE_BINDINGS[p]&&!book.sources?.[p]).map(p=>[p,SOURCE_BINDINGS[p]]))
    if(active&&(!book.sourcesInitialized||Object.keys(bindings).length))change({type:'init-sources',bindings,holidays:ledger.config.peakHolidays})
    return routes
  }
  const due=(state,hours)=>!state?.lastAttempt||now()-state.lastAttempt>=(state.status==='error'?Math.min(3600000,60000*2**Math.min(6,state.failures??0)):hours*3600000)
  async function refreshProvider(provider,routes,force=false){
    if(pending.has(provider))return pending.get(provider)
    const book=ledger.config.prices.book,binding=book.sources?.[provider]
    if(!active||!binding?.enabled||!PRICE_SOURCES[binding.sourceId]||!force&&!due(book.sync?.[provider],6))return
    const sourceId=binding.sourceId
    const job=(async()=>{
      try{
        const result=await fetchSource(sourceId,{fetcher,holidays:ledger.config.peakHolidays,now:now()})
        ledger.refresh();const current=ledger.config.prices.book
        if(!active||!current.sources?.[provider]?.enabled||current.sources[provider].sourceId!==sourceId)return
        const keys=new Set(routes.filter(r=>r.provider.replace(/^llm-/,'')===provider).map(r=>pricingKey(provider,r.model)))
        for(const record of current.records)if(record.to===null&&record.key.startsWith(provider+':'))keys.add(record.key)
        const models={},issues={}
        for(const key of keys){
          const old=current.records.findLast(r=>r.key===key&&r.to===null)
          if(old&&old.mode!=='auto'||!old&&current.records.some(r=>r.key===key&&r.deletedAt!==null))continue
          const model=key.slice(provider.length+1)
          if(result.models[model])models[key]=result.models[model]
          else issues[key]=result.errors?.[model]??'来源未返回此模型，保留旧价；无旧价则费用未知'
        }
        change({type:'sync-result',provider,models,issues,version:result.version,sourceUrl:result.sourceUrl})
      }catch(error){if(active&&ledger.config.prices.book.sources?.[provider]?.sourceId===sourceId)change({type:'sync-failure',provider,error:String(error?.message??error)})}
    })().finally(()=>pending.delete(provider))
    pending.set(provider,job);return job
  }
  async function refresh(provider,force=false){
    const routes=await initialize()
    const providers=provider?[provider]:Object.keys(ledger.config.prices.book.sources??{})
    // Keep remote hosts and the ledger responsive without overlapping writes.
    for(const id of providers)await refreshProvider(id,routes,force)
  }
  async function refreshFx(force=false){
    const book=ledger.config.prices.book
    if(!active||book.fxMode!=='auto'||!force&&!due(book.fxStatus,24))return
    if(pending.has('$fx'))return pending.get('$fx')
    const started=now(),job=(async()=>{
      try{const quote=await fetchUsdCny(fetcher);ledger.refresh();if(active&&ledger.config.prices.book.fxMode==='auto'&&(ledger.config.prices.book.fx.at(-1)?.at??0)<=started)change({type:'fx',mode:'auto',...quote})}
      catch(error){if(active&&ledger.config.prices.book.fxMode==='auto')change({type:'fx-failure',error:String(error?.message??error)})}
    })().finally(()=>pending.delete('$fx'));pending.set('$fx',job);return job
  }
  return {initialize,refresh,refreshFx,dispose(){active=false}}
}
