window.__ModuleLoader__.load({ id: 'dsh-usage-manager', chunk: 'client.custom.js', factory: require => {
  const React = require('react'); const { createElement: el, Fragment, useState, useEffect, useRef } = React;
  const css = `
    .um-page{min-width:0;font-size:13px;container-type:inline-size}.um-page *{box-sizing:border-box}.um-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.um-head h3{font-size:15px;margin:0}.um-muted{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.55}.um-periods{display:flex;flex-wrap:wrap;gap:4px;padding:4px;background:var(--dsw-alias-bg-layer-2);border-radius:9px;margin-bottom:12px}.um-periods button{border:0;background:transparent;color:inherit;font:inherit;padding:6px 10px;border-radius:6px;cursor:pointer}.um-periods button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-business-primary);box-shadow:0 1px 4px #0001}.um-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.um-metric{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:10px 12px;min-width:0}.um-value{font-size:24px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.3;overflow-wrap:anywhere}.um-metric.accent{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 5%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 20%,var(--dsw-alias-border-l1))}.um-parts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:10px 0 8px}.um-parts b{display:block;font-size:13px;font-variant-numeric:tabular-nums}.um-note{margin:8px 0 14px}.um-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin-top:14px;overflow:hidden}.um-panel-head{padding:11px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.um-panel h4{margin:0;font-size:13px}.um-select{font:inherit;color:inherit;max-width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:6px;padding:5px 7px}.um-row{display:grid;grid-template-columns:minmax(0,1fr) 74px 80px;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l1)}.um-row.head{font-size:11px;color:var(--dsw-alias-label-secondary);padding-top:7px;padding-bottom:7px;background:var(--dsw-alias-bg-layer-2)}.um-row>:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}.um-title{font:inherit;font-weight:500;color:inherit;background:none;border:0;padding:0;max-width:100%;text-align:left;cursor:pointer;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.um-child{background:var(--dsw-alias-bg-layer-2);font-size:12px}.um-child>:first-child{padding-left:12px;min-width:0}.um-child span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}.um-bar-row{display:grid;grid-template-columns:75px minmax(0,1fr) 78px;gap:8px;align-items:center;padding:5px 12px;font-size:11px}.um-bar{height:7px;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);overflow:hidden}.um-bar i{height:100%;display:block;background:var(--dsw-alias-state-business-primary);border-radius:5px}.um-filter{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.um-filter label{display:flex;flex-direction:column;gap:4px;min-width:0}.um-price-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(125px,auto) auto;gap:6px;align-items:center;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.um-price-row strong{display:block;overflow-wrap:anywhere;font-size:12px}.um-page details>summary{cursor:pointer}.um-page .cm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.um-page input{max-width:100%;min-width:0}.um-page .cm-btn{white-space:normal}.um-page .cm-field{min-width:0}@container(max-width:440px){.um-value{font-size:23px}.um-parts{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:8px}}
    .um-price-detail{min-width:0;font-variant-numeric:tabular-nums}.um-price-tier{display:flex;flex-wrap:wrap;gap:2px 12px}.um-price-tier>span{white-space:nowrap}
    @container(max-width:620px){.um-price-row:has(.um-price-detail){grid-template-columns:minmax(0,1fr) auto}.um-price-detail{grid-column:1/-1;grid-row:2}.um-price-row:has(.um-price-detail)>.cm-buttons{grid-column:2;grid-row:1}}
    .um-price-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.um-price-body,.um-price-editor{display:grid;gap:14px;padding:14px}.um-price-field{display:grid;gap:6px;min-width:0}.um-price-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.um-price-editor h4{margin:4px 0}.um-danger{color:var(--dsw-alias-status-error,var(--dsw-alias-state-error-primary))}.um-danger-confirm{background:var(--dsw-alias-button-danger-fill);color:var(--dsw-alias-button-danger-foreground)}
.um-price-input{min-width:0;width:100%;box-sizing:border-box}.um-price-modal{width:min(680px,100%);max-height:100%}.um-price-modal-content{min-height:0;overflow:auto}.um-price-editor{padding:0 24px}.um-price-body>button{justify-self:start}.um-confirm-content{padding:0 24px;box-sizing:border-box}.um-danger{color:var(--dsw-alias-state-error-primary)}.um-danger-confirm,.um-danger-confirm:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground)}
    .um-provider{margin-top:16px;padding:0 14px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px}.um-provider>.um-panel-head{padding-left:0;padding-right:0}.um-source-settings{font-size:11px;color:var(--dsw-alias-label-secondary);margin:8px 0}.um-source-settings>div{padding-top:8px}.um-sync-warning{color:var(--dsw-alias-state-warning-primary,#a06817);font-size:11px;line-height:1.6}.um-price-fields{grid-template-columns:repeat(3,minmax(0,1fr))}
  `;
  const channelName = id => ({'vx-api-default':'VX Default','vx-api-high':'VX High','vx-api-enterprise':'VX Enterprise','deepseek-official':'DeepSeek 官方','deepseek-volc':'火山方舟','wawa-zz-claudemax':'Wawa · Claude','wawa-zz-gemini':'Wawa · Gemini',deepseek:'DeepSeek 官方'})[id] ?? id
  function createComponents({ primitives, PRICE_BOOK, QuotasSection, BudgetPanel, PeakPanel, manualPriceKey, validManualPrice, resolveClientPrice, normalizeClientPrice, wawaPricePreset, formatMoneyUsd, formatTokens, version }) {
    function PriceDetails({ rate, t }) {
      const price = normalizeClientPrice(rate.entry)
      const tiers = ['deepseek-peak', 'utc-peak'].includes(rate.billingMode) && price.offPeak && price.peak
        ? [[t('priceOffPeak'), price.offPeak], [t('pricePeak'), price.peak]] : [['', price]]
      return el(Fragment, null,
        el('div', null, (rate.currency === 'CNY' ? '人民币' : '美元') + ' / 百万 Token'),
        ...tiers.map(([label, tier]) => el('div', { key: label, className: 'um-price-tier' },
          label ? el('b', null, label) : null,
          ...[['输入', 'cacheMiss'], ['缓存命中输入', 'cacheHit'], ['输出', 'output']].map(([name, key]) =>
            el('span', { key }, name + ' ' + tier[key])))))
    }
    const tokenTotal = row => (row?.input ?? 0) + (row?.cacheRead ?? 0) + (row?.cacheWrite ?? 0) + (row?.output ?? 0)
    function UsageOverview({ state, api }) {
      const [period,setPeriod]=useState('today'), [custom,setCustom]=useState({from:state.meta.dayKey,to:state.meta.dayKey})
      const [provider,setProvider]=useState(''), [model,setModel]=useState(''), [filters,setFilters]=useState(false)
      const [sort,setSort]=useState('cost'), [offset,setOffset]=useState(0), [open,setOpen]=useState({})
      const [data,setData]=useState(null), [error,setError]=useState(''), [loading,setLoading]=useState(true), [refresh,setRefresh]=useState(0)
      const today=state.meta.dayKey, from=period==='all'?'':period==='month'?today.slice(0,7)+'-01':period==='week'?new Date(Date.parse(today)-6*86400000).toISOString().slice(0,10):period==='custom'?custom.from:today
      const to=period==='custom'?custom.to:today
      const query={from,to,provider,model,sessionId:'',basis:'api',sort,offset}
      const key=JSON.stringify(query), previousQuery=useRef('')
      useEffect(()=>{let alive=true;setLoading(true);setError('');if(previousQuery.current!==key)setData(null);previousQuery.current=key
        api.loadStatistics().then(page=>page.queryStatistics(query)).then(value=>{if(alive){setData(value);setLoading(false)}},err=>{if(alive){setError(err.message);setLoading(false)}})
        return()=>{alive=false}
      },[api,key,state.meta.now,refresh])
      const money=n=>formatMoneyUsd(n,{...state.config,decimals:Math.max(2,state.config.decimals??2)})
      const exact=n=>(n??0).toLocaleString()+' Token'
      const value=row=>sort==='tokens'?tokenTotal(row):sort==='calls'?row.calls:row.apiCost
      const label=row=>sort==='tokens'?formatTokens(tokenTotal(row)):sort==='calls'?row.calls+' 次':money(row.apiCost)
      const choose=v=>{setPeriod(v);setOffset(0);setOpen({})}
      const metric=(label,value,hint,accent=false)=>el('div',{className:'um-metric'+(accent?' accent':'')},el('div',{className:'um-muted'},label),el('div',{className:'um-value',title:label==='总 Token'?exact(tokenTotal(data?.totals)):undefined},value),el('div',{className:'um-muted'},hint))
      const select=(label,value,change,options)=>el('label',{className:'um-muted'},label,el('select',{className:'um-select',value,'aria-label':label,onChange:e=>{change(e.target.value);setOffset(0)}},options.map(([value,label])=>el('option',{key:value,value},label))))
      const rowName=row=>row.title&&row.title!==row.id?row.title:'未命名会话 · '+row.id.slice(0,8)
      const amount=row=>row.unpriced ? (row.apiCost>0?money(row.apiCost)+' + 未定价':'未定价') : money(row.apiCost)
      const childRow=(row,name)=>el('div',{key:row.id,className:'um-row um-child'},el('div',null,el('span',{title:row.title||name},name),el('small',{className:'um-muted'},row.calls+' 次调用')),el('span',{title:exact(tokenTotal(row))},formatTokens(tokenTotal(row))),el('span',null,amount(row)))
      const top=data?.totals
      const unpriced=data?.models.some(row=>!row.priced)
      const days=data?.days??[], max=Math.max(1,...days.map(value))
      return el('div',{className:'um-page'},el('style',null,css),
        el('div',{className:'um-periods',role:'group','aria-label':'统计时间'},[['today','今天'],['week','近 7 天'],['month','本月'],['all','累计'],['custom','自定义']].map(([id,label])=>el('button',{key:id,'aria-pressed':period===id,onClick:()=>choose(id)},label))),
        period==='custom'?el('div',{className:'um-filter'},...['from','to'].map(k=>el('label',{key:k,className:'um-muted'},k==='from'?'开始日期':'结束日期',el('input',{type:'date',className:'um-select',value:custom[k],'aria-label':k==='from'?'开始日期':'结束日期',onChange:e=>{setCustom({...custom,[k]:e.target.value});setOffset(0)}})))):null,
        el('div',{className:'um-head'},el('span',{className:'um-muted'},provider?channelName(provider)+(model?' · '+model:''):'全部渠道 · 含子会话'),el('div',null,el('button',{className:'cm-btn small',onClick:()=>setRefresh(n=>n+1)},'刷新'), ' ',el('button',{className:'cm-btn small','aria-expanded':filters,onClick:()=>setFilters(!filters)},'筛选'))),
        filters?el('div',{className:'um-filter'},select('渠道',provider,v=>{setProvider(v);setModel('')},[['','全部渠道'],...[...new Set([...(data?.providers??[]),...(state.configuredModels??[]).map(r=>r.provider)])].map(p=>[p,channelName(p)])]),select('模型',model,setModel,[['','全部模型'],...[...new Set((state.configuredModels??[]).filter(r=>!provider||r.provider===provider).map(r=>r.model))].map(m=>[m,m])])):null,
        error?el('p',{className:'cm-msg err',role:'alert'},error):loading&&!data?el('p',{className:'cm-note',role:'status'},'正在读取用量…'):top?el(Fragment,null,
          el('div',{className:'um-grid'},metric('估算 API 费用',unpriced?(top.apiCost?money(top.apiCost)+' +': '—'):money(top.apiCost),unpriced?'部分模型未定价，金额不完整':'按记账价格估算 · 非官方账单'),metric('总 Token',formatTokens(tokenTotal(top)),'输入、缓存与输出合计',true),metric('模型调用',top.calls.toLocaleString()+' 次','每次模型请求记一次'),metric('主会话',data.mainSessionCount+' 个','含 '+data.childCount+' 个子会话'+(data.sessionCount>data.mainSessionCount?' · '+(data.sessionCount-data.mainSessionCount)+' 个未归属':''))),
          el('div',{className:'um-parts'},...[['input','普通输入'],['cacheRead','缓存读取'],['cacheWrite','缓存写入'],['output','输出']].map(([key,label])=>el('div',{key,className:'um-muted',title:exact(top[key])},label,el('b',null,formatTokens(top[key]))))),
          el('div',{className:'um-muted um-note'},data.from+' — '+data.to+' · 推理 Token 已含在输出，不重复相加。',el('div',null,'缓存写入中含 1h：'+formatTokens(top.cacheWrite1h??0)+' Token（不重复累加）'),top.cost>top.apiCost?el('div',null,'订阅用量折算 '+money(top.cost-top.apiCost)+'，不计入 API 费用。'):null,period==='all'?el('div',null,'累计覆盖现有及升级后保存的汇总；更早已清理记录无法补回。'):null),
          el('div',{className:'um-panel'},el('div',{className:'um-panel-head'},el('h4',null,'主会话'),el('div',null,el('button',{className:'cm-btn small',onClick:()=>{const expand=!data.sessions.every(row=>open[row.id]);setOpen(Object.fromEntries(data.sessions.map(row=>[row.id,expand]))) }},data.sessions.length&&data.sessions.every(row=>open[row.id])?'全部收起':'全部展开'), ' ',el('select',{className:'um-select',value:sort,'aria-label':'排行指标',onChange:e=>{setSort(e.target.value);setOffset(0)}},el('option',{value:'cost'},'按费用'),el('option',{value:'tokens'},'按 Token'),el('option',{value:'calls'},'按调用')))),
            el('div',{className:'um-row head'},el('span',null,'会话 · 点击展开'),el('span',null,'Token'),el('span',null,'API 费用')),
            data.sessions.length?data.sessions.map(row=>el(Fragment,{key:row.id},el('div',{className:'um-row'},el('div',null,el('button',{className:'um-title',title:rowName(row),'aria-expanded':!!open[row.id],onClick:()=>setOpen({...open,[row.id]:!open[row.id]})},(open[row.id]?'▾ ':'▸ ')+rowName(row)),el('div',{className:'um-muted'},row.calls+' 次调用'+(row.childCount?' · 含 '+row.childCount+' 个子会话':'')+(row.orphan?' · 未找到父会话':''))),el('span',{title:exact(tokenTotal(row))},formatTokens(tokenTotal(row))),el('span',null,amount(row))),open[row.id]?el(Fragment,null,childRow({...row.own,id:row.id+'-own',unpriced:row.unpriced},'主会话自身'),...row.children.map(child=>childRow(child,'↳ '+rowName(child))),row.childCount>row.children.length?el('p',{className:'um-muted'},'仅展开前 50 个子会话，汇总包含全部。'):null):null)):el('p',{className:'cm-note',style:{padding:'0 12px'}},'所选范围暂无会话。'),
            data.unassigned?.calls?childRow({...data.unassigned,id:'background'},'后台 / 未关联会话'):null,
            data.archived?.calls?childRow({...data.archived,id:'archive'},'已归档汇总（明细已过期）'):null,
            data.sessionCount>25?el('div',{className:'um-panel-head'},el('button',{className:'cm-btn',disabled:offset===0,onClick:()=>setOffset(Math.max(0,offset-25))},'上一页'),el('span',{className:'um-muted'},offset+1+'–'+Math.min(offset+25,data.sessionCount)+' / '+data.sessionCount),el('button',{className:'cm-btn',disabled:offset+25>=data.sessionCount,onClick:()=>setOffset(offset+25)},'下一页')):null),
          el('details',{className:'um-panel'},el('summary',{className:'um-panel-head'},'趋势与模型分布'),el('div',{className:'um-muted',style:{padding:'0 12px 8px'}},'与上方范围一致 · 趋势展示最近 31 天 · 模型前 8 名'),...days.slice(-31).map(row=>el('div',{key:row.date,className:'um-bar-row'},el('span',null,row.date.slice(5)),el('span',{className:'um-bar'},el('i',{style:{width:(100*value(row)/max)+'%'}})),el('span',null,label(row)))),...data.models.slice(0,8).map(row=>el('div',{key:row.key,className:'um-price-row',style:{padding:'8px 12px'}},el('div',null,el('strong',null,row.model),el('small',{className:'um-muted'},channelName(row.provider))),el('span',null,sort==='cost'&&!row.priced?'未定价':label(row)),null)))):null)
    }
    // Uses the original cm-* components and native DSH theme; only settings navigation changes.
    function CompactSettings({ state, api, t, draft, setDraft }) {
      const config = draft ?? state.config
      const set = patch => { if (draft) setDraft({ ...draft, ...patch }) }
      const toggle = (label, checked, change) => el('label', { className: 'cm-check' },
        el('input', { type: 'checkbox', checked, disabled: !draft, onChange: e => change(e.target.checked) }), label)
      const section = (label, body) => el('details', { className: 'cm-budget' },
        el('summary', { className: 'cm-h' }, label), el('div', { className: 'cm-collapse-body' }, body))
      return el(Fragment, null,
        el('div', { className: 'cm-budget' },
          el('h3', { className: 'cm-h' }, '常用开关'),
          el('div', { className: 'cm-collapse-body' },
            toggle('侧边栏费用', config.sidebar !== false, value => set({ sidebar: value })),
            toggle('会话费用', config.position !== 'off', value => set({ position: value ? 'dock' : 'off' })),
            toggle('每轮费用明细', config.hideTurnCost !== true, value => set({ hideTurnCost: !value })),
            toggle('预算', config.budget?.enabled === true, value => set({ budget: { ...config.budget, enabled: value } })),
            toggle('渠道价目自动更新', config.autoUpdatePrices !== false, value => set({ autoUpdatePrices: value })))),
        el('p', { className: 'cm-note' }, '开关自动保存。关闭查询来源后保留配置；需要时可再次开启。峰谷提醒需同时启用峰谷计价。'),
        section('订阅额度与自定义余额', el(QuotasSection, { state, api, t, draft, setDraft })),
        config.budget?.enabled ? section('预算设置', el(BudgetPanel, { state, draft, setDraft, t })) : null)
    }


    function ManualPricesPanel({state,api,t}) {
      const {Button,Input,Switch,Modal}=primitives
      const book=state.config.prices.book
      const [archived,setArchived]=useState(false),[search,setSearch]=useState(''),[form,setForm]=useState(null)
      const [confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
      const fx=book?.fx.at(-1)
      const [fxMode,setFxMode]=useState(book?.fxMode??'manual'),[fxValue,setFxValue]=useState(String(fx?.rate??''))
      useEffect(()=>{setFxMode(book?.fxMode??'manual');setFxValue(String(fx?.rate??''))},[book?.revision])
      if(!book)return el('p',{role:'status'},'价格版本尚未准备好，请正常重启应用。')
      const action=async request=>{
        setBusy(true);setError('')
        try{await api.pricingAction({...request,revision:book.revision});setForm(null);setConfirm(null)}
        catch(e){setError(e.message??String(e))}finally{setBusy(false)}
      }
      const active=book.records.filter(r=>r.to===null)
      const removed=book.records.filter(r=>r.deletedAt!==null).sort((a,b)=>b.deletedAt-a.deletedAt)
      const keys=new Set(active.map(r=>r.key))
      const deletedKeys=new Set(removed.map(r=>r.key))
      for(const row of state.configuredModels??[]) {const key=manualPriceKey(row.provider,row.model);if(!deletedKeys.has(key))keys.add(key)}
      const records=archived?removed:[...keys].map(key=>active.find(r=>r.key===key)??{key,id:null,source:'none'})
      const sourceOptions={'vx-default':'VX Default','vx-high':'VX High（高档货）','vx-enterprise':'VX Enterprise（企业级 MAX）',deepseek:'DeepSeek 官方',volcengine:'火山方舟',openai:'OpenAI 官方',anthropic:'Anthropic 官方',zhipu:'智谱官方',kimi:'Kimi 官方',google:'Gemini Developer API',openrouter:'OpenRouter'}
      const grouped=new Map()
      for(const record of records.filter(r=>!search||r.key.toLowerCase().includes(search.toLowerCase())||channelName(r.key.split(':')[0]).toLowerCase().includes(search.toLowerCase()))){const provider=record.key.split(':')[0];if(!grouped.has(provider))grouped.set(provider,[]);grouped.get(provider).push(record)}
      const formatDate=at=>new Date(at).toLocaleString('zh-CN',{hour12:false})
      const number=n=>Number.isFinite(n)?String(Number(n.toPrecision(10))):'未配置'
      const base=()=>({input:'',cachedInput:'',output:''})
      const edit=record=>{
        const split=record.key.indexOf(':'),rate=record.rate??{currency:'CNY',...base()}
        const factor=rate.currency==='USD'?fx.rate:1
        const convert=value=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['input','cachedInput','output','cacheWrite','cacheWrite1h'].includes(k)&&typeof v==='number'?v*factor:k==='cacheWriteExtended'?{...v,price:v.price*factor}:v]))
        const next={...convert(rate),currency:'CNY',offPeak:convert(rate.offPeak??rate),peak:convert(rate.peak??rate),...(rate.longContext?{longContext:convert(rate.longContext)}:{})}
        setForm({provider:record.key.slice(0,split),model:record.key.slice(split+1),expectedId:record.id,rate:next})
        setError('')
      }
      const field=(label,value,onChange,extra={})=>el('label',{className:'um-price-field'},el('span',null,label),el(Input,{className:'um-price-input',value,onChange:e=>onChange(e.target.value),...extra}))
      const rates=(tier,change)=>el('div',{className:'um-price-fields'},...[['input','普通输入'],['output','输出'],['cachedInput','缓存读取'],['cacheWrite','缓存写入'],['cacheWrite1h','缓存写入（1h）']].map(([key,label])=>field(label,tier[key]??'',value=>change({...tier,[key]:value}),{type:'number',min:'0',step:'any','aria-label':label,placeholder:key.startsWith('cacheWrite')?'未提供':undefined})))
      const toRate=rate=>{
        const convert=tier=>{const result={...tier,...Object.fromEntries(['input','cachedInput','output','cacheWrite','cacheWrite1h'].filter(k=>tier[k]!==undefined&&tier[k]!=='').map(k=>[k,Number(tier[k])]))};for(const k of ['cacheWrite','cacheWrite1h'])if(result[k]==='')delete result[k];return result}
        return {...convert(rate),...(rate.peakPricing?.enabled?{offPeak:convert(rate.offPeak),peak:convert(rate.peak)}:{offPeak:undefined,peak:undefined}),
          ...(rate.longContext?{longContext:{...convert(rate.longContext),aboveInputTokens:Number(rate.longContext.aboveInputTokens)}}:{})}
      }
      const setRate=rate=>setForm({...form,rate})
      const save=()=>action({type:'save',key:manualPriceKey(form.provider,form.model),expectedId:form.expectedId,rate:toRate(form.rate)})
      const priceView=record=>{
        if(!record.rate)return el('span',{className:'um-muted'},'未配置价格 · 用量照常记录')
        const rate=record.rate,factor=rate.currency==='USD'?fx.rate:1
        const tiers=rate.peakPricing?.enabled?[['空闲',rate.offPeak],['高峰',rate.peak]]:[['',rate]]
        return el('div',{className:'um-price-detail um-muted'},el('div',null,'元 / 百万 Token'),...tiers.map(([name,tier])=>el('div',{key:name,className:'um-price-tier'},name?el('b',null,name):null,
          ...[['input','输入'],['output','输出'],['cachedInput','缓存读取'],['cacheWrite','缓存写入'],['cacheWrite1h','写入（1h）']].map(([key,label])=>el('span',{key},label+' '+(tier[key]===undefined?'—':number(tier[key]*factor)))))),rate.longContext?el('div',null,'输入超过 '+rate.longContext.aboveInputTokens.toLocaleString()+' Token 使用阶梯价'):null,rate.effortMultiplier?el('div',null,'最高思考强度（max）时 ×'+rate.effortMultiplier):null,rate.cacheWriteExtended?el('div',null,'另有 '+(rate.cacheWriteExtended.seconds/3600)+'h 写入价 '+number(rate.cacheWriteExtended.price*factor)):null)
      }
      return el('div',{className:'um-page'},el('style',null,css),
        el('div',{className:'um-head'},el('h3',null,archived?'已删除的价格':'模型价格'),el('div',{className:'um-price-actions'},
          el(Button,{variant:'outline',onClick:()=>{setArchived(!archived);setSearch('')}},archived?'返回模型价格':'已删除（'+removed.length+'）'),
          !archived?el(Button,{variant:'outline',disabled:busy,onClick:()=>action({type:'refresh'})},'刷新'):null,
          !archived?el(Button,{variant:'primary',onClick:()=>edit({key:':',id:null})},'添加价格'):null)),
        el('p',{className:'um-muted'},archived?'查看不会恢复记录。恢复后从当前时间生效，旧消费不变。':'全部按人民币计价。手填价优先；不跨渠道匹配。修改只影响之后的调用。'),
        book.audit?el('details',{className:'um-panel'},el('summary',{className:'um-panel-head'},'历史费用记录'),el('div',{className:'um-price-body'},
          el('p',null,book.audit.status==='repriced'?'历史已重算：¥'+number(book.audit.beforeCny)+' → ¥'+number(book.audit.afterCny)+'，差额 '+(book.audit.deltaCny>=0?'+':'')+'¥'+number(book.audit.deltaCny)+'。':book.audit.status==='normalized'?'旧账已统一：'+book.audit.verified+' 组已核价修正，'+book.audit.retainedGroups+' 组保留原人民币金额。':'已核对 '+book.audit.verified+' 组，待核实 '+book.audit.pending+' 组；已修正差额 ¥'+number(book.audit.deltaCny)+'。'),
          el('p',{className:'um-muted'},book.audit.status==='repriced'?'历史金额已保存，后续价格或汇率变化不影响这些记录。':book.audit.status==='normalized'?'旧记录以账本金额为准，明细不足的显示历史汇总；新调用保存独立消费凭据。':'缺少日志或当时价格的记录保留原估算。'),
          el('p',{className:'um-muted'},book.audit.reportPath))):null,
        !archived&&(state.configuredModels??[]).some(r=>['openrouter','llm-openrouter'].includes(r.provider))?el(Button,{variant:'outline',disabled:busy,onClick:()=>action({type:'syncOpenRouter'})},'同步 OpenRouter 官方价目'):null,
        error?el('p',{role:'alert'},error):null,
        !archived?el('details',{className:'um-panel'},el('summary',{className:'um-panel-head'},'美元兑人民币 · 1 美元 = '+number(fx.rate)+' 元'),
          el('div',{className:'um-price-body'},el('div',{className:'um-price-actions'},
            el(Button,{variant:fxMode==='auto'?'primary':'outline',disabled:busy,onClick:()=>{setFxMode('auto');action({type:'fx',mode:'auto'})}},'自动更新'),el(Button,{variant:fxMode==='manual'?'primary':'outline',onClick:()=>setFxMode('manual')},'手动填写')),
            field('1 美元折合人民币',fxValue,setFxValue,{type:'number',min:'0.000001',step:'any',disabled:fxMode==='auto'}),
            el('p',{className:'um-muted'},fx.source+' · '+fx.date+'；历史消费金额固定。'),
            book.fxStatus?.status==='error'?el('p',{role:'status',className:'um-sync-warning'},'汇率更新失败，暂用 '+fx.date+' 的汇率。'+book.fxStatus.error):null,
            fxMode==='auto'?el('p',{className:'um-muted'},'已启用每日自动更新，失败会重试；无需每天手动获取。'):null,
            el(Button,{variant:'primary',disabled:busy,onClick:()=>action({type:'fx',mode:fxMode,rate:Number(fxValue)})},fxMode==='auto'?'立即更新':'保存汇率'))):null,
        el(Input,{value:search,onChange:e=>setSearch(e.target.value),placeholder:'搜索渠道或模型','aria-label':'搜索模型价格'}),
        ...[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([provider,list])=>{
          const binding=book.sources?.[provider],status=book.sync?.[provider],warning=status?.status==='error'||status?.status==='partial'
          return el('section',{key:provider,className:'um-provider'},
            el('div',{className:'um-panel-head'},el('strong',null,channelName(provider)),el('span',{className:'um-muted'},list.length+' 个模型'),
              !archived&&binding?el(Button,{variant:'outline',size:'sm',disabled:busy,onClick:()=>action({type:'syncPrices',provider})},'立即同步'):null),
            !archived?el(Fragment,null,
              el('div',{className:warning?'um-sync-warning':'um-muted',role:warning?'status':undefined},!binding?'手动维护 · 尚未绑定自动来源':binding.enabled===false?'自动同步已暂停':status?.status==='error'?'同步失败，暂用旧价':status?.status==='partial'?'部分型号暂无最新价目，沿用已保存价格':status?.status==='ok'?'自动同步正常':'等待首次同步',status?.lastSuccess?' · 上次成功 '+formatDate(status.lastSuccess):'',status?.error?' · '+status.error:''),
              el('details',{className:'um-source-settings'},el('summary',null,'价格来源'),el('div',{className:'um-price-actions'},el('select',{className:'um-select','aria-label':channelName(provider)+'价格来源',value:binding?.sourceId??'',disabled:busy,onChange:e=>e.target.value&&action({type:'source-mode',provider,sourceId:e.target.value,enabled:true})},el('option',{value:''},'选择可信来源…'),...Object.entries(sourceOptions).map(([value,label])=>el('option',{key:value,value},label))),binding?el(Switch,{label:'自动同步 '+channelName(provider),checked:binding.enabled!==false,onChange:enabled=>action({type:'source-mode',provider,sourceId:binding.sourceId,enabled})}):null),el('p',{className:'um-muted'},'仅绑定实际收费渠道；手动锁定的模型不会被覆盖。'))):null,
            ...list.map(record=>el('div',{key:record.id??record.key,className:'um-price-row'},
              el('div',null,el('strong',null,record.key.slice(record.key.indexOf(':')+1)),el('span',{className:'um-muted'},!record.rate?'未配置':record.mode==='auto'?'跟随来源':'手动锁定'),
                status?.issues?.[record.key]?el('div',{className:'um-sync-warning'},status.issues[record.key]):null,
                archived?el('div',{className:'um-muted'},record.source==='legacy-deletion'?'旧版删除项 · 原价格与删除时间未留存':'删除于 '+formatDate(record.deletedAt)):null),priceView(record),
              el('div',{className:'um-price-actions cm-buttons'},archived?el(Button,{variant:'outline',size:'sm',disabled:busy,onClick:()=>record.rate?action({type:'restore',id:record.id}):edit({...record,id:null})},record.rate?'恢复':'重新填写'):
                el(Fragment,null,el(Button,{variant:'outline',size:'sm',onClick:()=>edit(record)},record.id?'编辑':'设置价格'),record.id&&binding&&record.mode!=='auto'?el(Button,{variant:'ghost',size:'sm',disabled:busy,onClick:()=>action({type:'record-mode',key:record.key,mode:'auto'})},'跟随来源'):null,record.id?el(Button,{variant:'ghost',size:'sm',className:'um-danger',onClick:()=>setConfirm(record)},'删除'):null)))))
        }),
        archived&&removed.length===0?el('p',{className:'um-muted'},'没有已删除的价格。'):null,
        el(Modal,{open:!!confirm,title:'删除价格记录',closeLabel:'关闭',contentClassName:'um-confirm-content',onClose:()=>!busy&&setConfirm(null),footer:el(Fragment,null,
          el(Button,{variant:'outline',disabled:busy,onClick:()=>setConfirm(null)},'取消'),el(Button,{variant:'primary',className:'um-danger-confirm',disabled:busy,onClick:()=>action({type:'delete',id:confirm.id})},'确认删除'))},
          el('p',null,confirm?.key),el('p',null,'停止使用此价格并移入已删除记录。历史消费和模型配置保留；后续调用在重新设置价格前标为未计价。')),
        el(Modal,{open:!!form,title:form?.expectedId?'编辑模型价格':'添加模型价格',closeLabel:'关闭',className:'um-price-modal',contentClassName:'um-price-modal-content',onClose:()=>!busy&&setForm(null),footer:el(Fragment,null,
          el(Button,{variant:'outline',disabled:busy,onClick:()=>setForm(null)},'取消'),el(Button,{variant:'primary',disabled:busy||!form?.provider||!form?.model||!PRICE_BOOK.validBookRate(toRate(form.rate)),onClick:save},'保存'))},form?el('div',{className:'um-price-editor'},
          error?el('p',{role:'alert'},error):null,
          !form.expectedId?el('label',{className:'um-price-field'},'选择已配置模型',el('select',{className:'um-select',value:'',onChange:e=>{if(e.target.value)edit({key:e.target.value,id:null})}},el('option',{value:''},'选择模型…'),...(state.configuredModels??[]).map(row=>el('option',{key:manualPriceKey(row.provider,row.model),value:manualPriceKey(row.provider,row.model)},row.provider+' / '+row.model)))):null,
          field('渠道',form.provider,value=>setForm({...form,provider:value}),{disabled:!!form.expectedId}),field('模型',form.model,value=>setForm({...form,model:value}),{disabled:!!form.expectedId}),
          el('p',{className:'um-muted'},'人民币 / 百万 Token。保存后锁定手填价，即时用于之后调用；历史金额不变。普通输入不包含缓存读写；1h 为写入的保留时长。'),
          el('div',{className:'um-price-actions'},el(Switch,{checked:!!form.rate.peakPricing?.enabled,label:'峰谷计价',onChange:enabled=>setRate({...form.rate,peakPricing:{...(form.rate.peakPricing??PRICE_BOOK.defaultPeakRule()),enabled}})}),'峰谷计价'),
          form.rate.peakPricing?.enabled?el(Fragment,null,el('h4',null,'空闲时段'),rates(form.rate.offPeak,value=>setRate({...form.rate,offPeak:value})),el('h4',null,'高峰时段'),rates(form.rate.peak,value=>setRate({...form.rate,peak:value})),
            el('details',null,el('summary',null,'时段设置 · 北京时间'),el('p',{className:'um-muted'},'以请求完成时间判断时段。未命中的时间使用空闲价。'),
              el('label',{className:'um-price-field'},'规则',el('select',{className:'um-select',value:form.rate.peakPricing.preset,onChange:e=>setRate({...form.rate,peakPricing:{...PRICE_BOOK.defaultPeakRule(e.target.value),holidays:e.target.value==='deepseek'?(state.config.peakHolidays??[]):[]}})},...['deepseek','volcengine','custom'].map(value=>el('option',{key:value,value},({deepseek:'DeepSeek 官方',volcengine:'火山方舟',custom:'自定义'})[value])))),
              el('div',{className:'um-price-actions'},...[0,1,2,3,4,5,6].map(day=>el('label',{key:day},el('input',{type:'checkbox',checked:form.rate.peakPricing.weekdays.includes(day),onChange:e=>setRate({...form.rate,peakPricing:{...form.rate.peakPricing,weekdays:e.target.checked?[...form.rate.peakPricing.weekdays,day]:form.rate.peakPricing.weekdays.filter(x=>x!==day)}})}),['日','一','二','三','四','五','六'][day]))),
              ...form.rate.peakPricing.windows.map((window,index)=>el('div',{key:index,className:'um-price-actions'},...['start','end'].map(key=>field(key==='start'?'开始':'结束',String(Math.floor(window[key]/60)).padStart(2,'0')+':'+String(window[key]%60).padStart(2,'0'),value=>{const [h,m]=value.split(':').map(Number);setRate({...form.rate,peakPricing:{...form.rate.peakPricing,windows:form.rate.peakPricing.windows.map((w,i)=>i===index?{...w,[key]:h*60+m}:w)}})},{type:'time'})))),
              field('全天空闲日期（逗号分隔）',form.rate.peakPricing.holidays.join(','),value=>setRate({...form.rate,peakPricing:{...form.rate.peakPricing,holidays:value.split(',').map(x=>x.trim()).filter(Boolean)}})))):
            rates(form.rate,setRate),
          el('details',null,el('summary',null,'阶梯与动态规则'),
            form.rate.effortMultiplier!==undefined?field('output_config.effort=max 费用倍率',form.rate.effortMultiplier,value=>setRate({...form.rate,effortMultiplier:Number(value)}),{type:'number',min:'0.01',step:'any'}):null,
            el('p',{className:'um-muted'},'按存储时长收费的缓存不属于此项；缺少存储时长时不计入估算。'),
            el('label',null,el('input',{type:'checkbox',checked:!!form.rate.longContext,onChange:e=>setRate({...form.rate,longContext:e.target.checked?{...base(),aboveInputTokens:200000}:undefined})}),'长上下文阶梯价'),
            form.rate.longContext?el(Fragment,null,field('输入 Token 阈值',form.rate.longContext.aboveInputTokens,value=>setRate({...form.rate,longContext:{...form.rate.longContext,aboveInputTokens:value}}),{type:'number'}),rates(form.rate.longContext,value=>setRate({...form.rate,longContext:value}))):null)) : null))
    }

    return { settings: CompactSettings, prices: ManualPricesPanel, overview: UsageOverview };
  }
  return { createComponents };
}});
