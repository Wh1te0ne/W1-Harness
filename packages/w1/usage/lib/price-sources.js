import {createHash} from 'node:crypto'
import {parsePricingHtml,parseOpenRouterModels,normalizePrice} from './pricing.js'
import {defaultPeakRule,validBookRate} from './price-book.js'
import {parseVxCatalog} from './vx-pricing.js'

export const PRICE_SOURCES={
  'vx-default':{name:'VX Default',url:'https://la-api.vxvxvx.top/api/pricing',group:'default',kind:'vx'},
  'vx-high':{name:'VX High',url:'https://la-api.vxvxvx.top/api/pricing',group:'GPT/Claude高档货',kind:'vx'},
  'vx-enterprise':{name:'VX Enterprise',url:'https://la-api.vxvxvx.top/api/pricing',group:'GPT/Claude企业级MAX',kind:'vx'},
  deepseek:{name:'DeepSeek 官方',url:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',kind:'deepseek'},
  volcengine:{name:'火山方舟官方价目',url:'https://ark.volcengine.com/region:cn-beijing/docs/model-pricing.md',kind:'volcengine'},
  openai:{name:'OpenAI 官方',url:'https://developers.openai.com/api/docs/pricing.md',kind:'openai'},
  anthropic:{name:'Anthropic 官方',url:'https://platform.claude.com/docs/en/about-claude/pricing',kind:'anthropic'},
  zhipu:{name:'智谱官方',url:'https://docs.bigmodel.cn/cn/guide/start/pricing.md',kind:'zhipu'},
  kimi:{name:'Kimi 官方',url:'https://platform.kimi.com/docs/pricing/chat',kind:'kimi'},
  google:{name:'Gemini Developer API',url:'https://ai.google.dev/gemini-api/docs/pricing',kind:'google'},
  openrouter:{name:'OpenRouter 官方',url:'https://openrouter.ai/api/v1/models',kind:'openrouter'},
}
export const SOURCE_BINDINGS={'vx-api-default':'vx-default','vx-api-high':'vx-high','vx-api-enterprise':'vx-enterprise','deepseek-official':'deepseek','deepseek':'deepseek','deepseek-volc':'volcengine',openrouter:'openrouter'}
const strip=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&(?:lt|#60);/g,'<').replace(/&(?:gt|#62);/g,'>').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
const tables=html=>(html.match(/<table\b[\s\S]*?<\/table>/gi)??[]).map(t=>(t.match(/<tr\b[\s\S]*?<\/tr>/gi)??[]).map(r=>(r.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi)??[]).map(strip)))
const rows=md=>md.split(/\r?\n/).map(l=>l.replace(/^>\s*/, '').trim()).filter(l=>l.startsWith('|')).map(l=>l.replace(/\|\s*\\?$/,'').slice(1).split('|').map(s=>s.trim()))
const number=s=>{const value=String(s).replace(/^[$¥￥]/,'').replace(/,/g,'').trim();if(!/^\d+(\.\d+)?$/.test(value))throw Error('价格数值或单位无法识别');return Number(value)}
const base=(currency,input,cachedInput,output)=>({currency,input:number(input),cachedInput:number(cachedInput),output:number(output)})
function fromCanonical(rate,currency){return {...base(currency,rate.cacheMiss,rate.cacheHit,rate.output),...(rate.cacheWrite===undefined?{}:{cacheWrite:rate.cacheWrite}),...(rate.longContext?{longContext:{...fromCanonical(rate.longContext,currency),aboveInputTokens:rate.longContext.aboveInputTokens}}:{})}}
export function parseSource(sourceId,text,{holidays=[],now=Date.now()}={}){
  const source=PRICE_SOURCES[sourceId];if(!source)throw Error('不支持的价格来源')
  if(source.kind==='vx')return parseVxCatalog(JSON.parse(text),source.group)
  const models={},errors={}
  const put=(id,fn)=>{try{const rate=fn();if(!validBookRate(rate))throw Error('价目字段不完整');models[id]=rate}catch(e){errors[id]=e.message}}
  if(source.kind==='deepseek'){
    if(!text.includes('不含中国法定节假日')||!text.includes('9:00')||!text.includes('14:00'))throw Error('官方峰谷规则发生变化，保留旧价')
    const parsed=parsePricingHtml(text);if(parsed.currency!=='CNY')throw Error('官方价目币种变化')
    for(const [id,entry]of Object.entries(parsed.models))put(id,()=>({...fromCanonical(entry,'CNY'),cacheWrite:entry.cacheMiss,offPeak:{...fromCanonical(entry.offPeak,'CNY'),cacheWrite:entry.offPeak.cacheMiss},peak:{...fromCanonical(entry.peak,'CNY'),cacheWrite:entry.peak.cacheMiss},peakPricing:{...defaultPeakRule('deepseek'),holidays}}))
  } else if(source.kind==='openrouter'){
    for(const [id,entry]of Object.entries(parseOpenRouterModels(JSON.parse(text)).models)){const normalized=normalizePrice(entry);if(normalized&&!entry.unpriced)put(id,()=>fromCanonical(normalized,'USD'))}
  } else if(source.kind==='volcengine'){
    const section=text.split('## 在线推理（常规）')[1]?.split('## 在线推理（低延迟）')[0]
    if(!section?.includes('元/百万token')||!section.includes('请求完成时间'))throw Error('火山价目结构或时段规则变化')
    const list=rows(section)
    for(let i=0;i<list.length;i++){
      const r=list[i],id=r[0]
      if(!/^[a-z][a-z0-9.-]+$/.test(id)||r.length<8)continue
      const rate=()=>({...base('CNY',r[2],r[5],r[7]),cacheWrite:number(r[2])})
      if(id==='deepseek-v4-1-flash'&&r[1]==='空闲时段'){
        const peak=list.slice(i+1,i+4).find(row=>row[1]==='高峰时段')
        put('deepseek-v4-1-flash-261017',()=>({...rate(),offPeak:rate(),peak:{...base('CNY',peak?.[2],peak?.[5],peak?.[7]),cacheWrite:number(peak?.[2])},peakPricing:defaultPeakRule('volcengine')}));continue
      }
      if(list.slice(i+1,i+4).some(row=>row[0]==='^^')){errors[id]='多段模型价目需要进一步适配';continue}
      put(id,rate)
    }
  } else if(source.kind==='zhipu'){
    if(!text.includes('元/百万 Tokens'))throw Error('智谱价格单位变化')
    for(const r of rows(text))if(/^GLM-/i.test(r[0])&&r.length>=6){
      const id=r[0].toLowerCase()
      if(/输入长度/.test(r[1])){errors[id]='上下文分档需要适配';delete models[id];continue}
      put(id,()=>({...base('CNY',r[2],r[5],r[3]),cacheWrite:number(r[2])}))
    }
  } else if(source.kind==='kimi'){
    // The official Markdown export omits these tables. Read bounded literal cells from the official HTML, never execute its scripts.
    const rowPattern=/\[`(kimi-[a-z0-9.-]+)`,`1M tokens`,([^\]\n]{1,1200})\]/g
    for(const m of text.matchAll(rowPattern)){
      const cells=[...m[2].matchAll(/`([^`]+)`/g)].map(x=>x[1])
      put(m[1],()=>cells.length===6?{...base('CNY',cells[3],cells[2],cells[4]),cacheWrite:number(cells[0]),cacheWrite1h:number(cells[1])}:base('CNY',cells[1],cells[0],cells[2]))
    }
  } else if(source.kind==='openai'){
    const section=text.split('### Standard pricing data')[1]?.split('### Batch pricing data')[0]
    if(!section||!text.includes('Short context: ≤272K input tokens'))throw Error('OpenAI 标准价格或上下文条件变化')
    for(const r of rows(section))if(/^(gpt-|o\d)/.test(r[0])){
      const id=r[0].split(' ')[0]
      put(id,()=>{const rate=base('USD',r[1],r[3]==='-'?r[1]:r[3],r[2]);if(r.length===11){
        if(r[4]!=='-'){rate.cacheWrite=number(r[4]);rate.cacheWriteExtended={seconds:43200,price:number(r[5])}}
        rate.longContext={...base('USD',r[6],r[8]==='-'?r[6]:r[8],r[7]),aboveInputTokens:272000,...(r[9]==='-'?{}:{cacheWrite:number(r[9]),cacheWriteExtended:{seconds:43200,price:number(r[10])}})}
      }return rate})
    }
  } else if(source.kind==='anthropic'){
    const table=tables(text).find(t=>t.some(r=>r.join(' ').includes('5m writes')))
    if(!table)throw Error('Claude 缓存价格列缺失')
    for(const r of table){const m=r[0]?.match(/^Claude (Fable|Opus|Sonnet|Haiku|Mythos) (\d+(?:\.\d+)*)\b/);if(!m||r.length<6)continue
      const id='claude-'+m[1].toLowerCase()+'-'+m[2].replaceAll('.','-')
      put(id,()=>{if(r.slice(1,6).some(c=>(c.match(/\$/g)??[]).length!==1||/prompts|tokens|MTok for/.test(c)))throw Error('该模型存在尚未适配的分档');const values=r.slice(1,6).map(c=>c.match(/\$([\d.]+)/)?.[1]);return {...base('USD',values[0],values[4],values[1]),cacheWrite:number(values[2]),cacheWrite1h:number(values[3])}})
    }
  } else if(source.kind==='google'){
    for(const section of text.split(/(?=<h2\b)/)){
      const id=section.match(/^<h2[^>]*id="(gemini-[a-z0-9.-]+)"/)?.[1];if(!id)continue
      const table=tables(section)[0];if(!table?.some(r=>r.join(' ').includes('per 1M tokens in USD')))continue
      put(id,()=>{const get=label=>{const cell=table.find(r=>r[0]?.startsWith(label))?.at(-1);if(!cell)throw Error('价格项缺失');const values=[...cell.matchAll(/\$([\d.]+)/g)];if(values.length===1)return number(values[0][1]);const scheduled=cell.match(/\$([\d.]+) through ([A-Za-z]+ \d+, \d{4})\.\s*\$([\d.]+) starting ([A-Za-z]+ \d+, \d{4})\./);if(scheduled&&Number.isFinite(Date.parse(scheduled[4])))return number(now<Date.parse(scheduled[4])?scheduled[1]:scheduled[3]);throw Error('多模态或分档价格需要适配')};return base('USD',get('Input price'),get('Context caching price'),get('Output price'))})
    }
  }
  if(!Object.keys(models).length)throw Error('未提取到完整价目，保留旧价')
  return {models,errors,version:createHash('sha256').update(text).digest('hex'),sourceUrl:source.url}
}
export async function fetchSource(sourceId,options={}){
  const source=PRICE_SOURCES[sourceId];if(!source)throw Error('不支持的价格来源')
  const response=await (options.fetcher??fetch)(source.url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json,text/markdown,text/html'}})
  if(!response.ok)throw Error('价格来源 HTTP '+response.status)
  let text='',size=0;const decoder=new TextDecoder()
  for await(const chunk of response.body){size+=chunk.byteLength;if(size>4*1024*1024)throw Error('价格响应超出大小限制');text+=decoder.decode(chunk,{stream:true})}text+=decoder.decode()
  return {...parseSource(sourceId,text,options),sourceUrl:source.url}
}
