window.__ModuleLoader__.load({ id: 'dsh-usage-manager', chunk: 'client.custom.js', factory: require => {
  const React = require('react'); const { createElement: el, Fragment, useState, useEffect, useRef } = React;
  const css = `
    .um-page{min-width:0;font-size:13px;container-type:inline-size}.um-page *{box-sizing:border-box}.um-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.um-head h3{font-size:15px;margin:0}.um-muted{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.55}.um-periods{display:flex;flex-wrap:wrap;gap:4px;padding:4px;background:var(--dsw-alias-bg-layer-2);border-radius:9px;margin-bottom:12px}.um-periods button{border:0;background:transparent;color:inherit;font:inherit;padding:6px 10px;border-radius:6px;cursor:pointer}.um-periods button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-business-primary);box-shadow:0 1px 4px #0001}.um-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.um-metric{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:10px 12px;min-width:0}.um-value{font-size:24px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.3;overflow-wrap:anywhere}.um-metric.accent{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 5%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 20%,var(--dsw-alias-border-l1))}.um-parts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:10px 0 8px}.um-parts b{display:block;font-size:13px;font-variant-numeric:tabular-nums}.um-note{margin:8px 0 14px}.um-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin-top:14px;overflow:hidden}.um-panel-head{padding:11px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.um-panel h4{margin:0;font-size:13px}.um-select{font:inherit;color:inherit;max-width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:6px;padding:5px 7px}.um-row{display:grid;grid-template-columns:minmax(0,1fr) 74px 80px;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l1)}.um-row.head{font-size:11px;color:var(--dsw-alias-label-secondary);padding-top:7px;padding-bottom:7px;background:var(--dsw-alias-bg-layer-2)}.um-row>:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}.um-title{font:inherit;font-weight:500;color:inherit;background:none;border:0;padding:0;max-width:100%;text-align:left;cursor:pointer;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.um-child{background:var(--dsw-alias-bg-layer-2);font-size:12px}.um-child>:first-child{padding-left:12px;min-width:0}.um-child span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}.um-bar-row{display:grid;grid-template-columns:75px minmax(0,1fr) 78px;gap:8px;align-items:center;padding:5px 12px;font-size:11px}.um-bar{height:7px;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);overflow:hidden}.um-bar i{height:100%;display:block;background:var(--dsw-alias-state-business-primary);border-radius:5px}.um-filter{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.um-filter label{display:flex;flex-direction:column;gap:4px;min-width:0}.um-price-row{display:grid;grid-template-columns:minmax(0,1fr) 105px 48px;gap:6px;align-items:center;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.um-price-row strong{display:block;overflow-wrap:anywhere;font-size:12px}.um-page details>summary{cursor:pointer}.um-page .cm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.um-page input{max-width:100%;min-width:0}.um-page .cm-btn{white-space:normal}.um-page .cm-field{min-width:0}@container(max-width:440px){.um-value{font-size:23px}.um-parts{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:8px}}
  `;
  const channelName = id => ({'vx-api-default':'VX','wawa-zz-claudemax':'Wawa · Claude','wawa-zz-gemini':'Wawa · Gemini',deepseek:'DeepSeek 官方'})[id] ?? id
  function createComponents({ QuotasSection, BudgetPanel, PeakPanel, manualPriceKey, validManualPrice, resolveClientPrice, wawaPricePreset, formatMoneyUsd, formatTokens, version }) {
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
          el('div',{className:'um-muted um-note'},data.from+' — '+data.to+' · 推理 Token 已含在输出，不重复相加。',top.cost>top.apiCost?el('div',null,'订阅用量折算 '+money(top.cost-top.apiCost)+'，不计入 API 费用。'):null,period==='all'?el('div',null,'累计覆盖现有及升级后保存的汇总；更早已清理记录无法补回。'):null),
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
            toggle('峰谷计价', config.peakEnabled === true, value => set({ peakEnabled: value })),
            toggle('峰谷切换提醒', config.peakAlertEnabled === true, value => set({ peakAlertEnabled: value })),
            toggle('OpenRouter 价目自动更新', config.autoUpdatePrices !== false, value => set({ autoUpdatePrices: value })))),
        el('p', { className: 'cm-note' }, '开关自动保存。关闭查询来源后保留配置；需要时可再次开启。峰谷提醒需同时启用峰谷计价。'),
        section('订阅额度与自定义余额', el(QuotasSection, { state, api, t, draft, setDraft })),
        config.budget?.enabled ? section('预算设置', el(BudgetPanel, { state, draft, setDraft, t })) : null,
        section('峰谷时段与提醒设置', el(PeakPanel, { state, draft, setDraft, t })))
    }

    function ManualPricesPanel({ state, draft, setDraft }) {
      const config = draft ?? state.config
      const table = config.prices?.manual ?? {}
      const [provider, setProvider] = useState('')
      const [model, setModel] = useState('')
      const [currency, setCurrency] = useState('CNY')
      const emptyRates = () => ({ input: '', cachedInput: '', output: '', cacheWrite: '', cacheWrite1h: '' })
      const [rates, setRates] = useState(emptyRates)
      const [longRates, setLongRates] = useState(emptyRates)
      const [longEnabled, setLongEnabled] = useState(false)
      const [threshold, setThreshold] = useState('200000')
      const [ttl, setTtl] = useState('5m')
      const [feedback, setFeedback] = useState('')
      const [editing, setEditing] = useState(false)
      const [search, setSearch] = useState('')
      const [editRevision, setEditRevision] = useState(0)
      const editorRef = useRef(null)
      useEffect(() => { if (editing) editorRef.current?.scrollIntoView({ block: 'start' }) }, [editing, editRevision])
      const keys = new Set(Object.keys(table))
      for (const row of state.configuredModels ?? []) keys.add(manualPriceKey(row.provider, row.model))
      for (const record of [state.total, state.today, ...(state.history ?? [])]) {
        for (const key of Object.keys(record?.byProviderModel ?? {})) keys.add(key)
      }
      const select = key => {
        setEditing(true)
        setEditRevision(n => n + 1)
        const sep = key.indexOf(':'); if (sep < 1) return
        const p = key.slice(0, sep), m = key.slice(sep + 1)
        setProvider(p); setModel(m); setFeedback('')
        const manual = table[manualPriceKey(p, m)]
        if (manual) {
          setCurrency(manual.currency)
        }
        const toFields = value => Object.fromEntries(Object.keys(emptyRates()).map(field => [field, value?.[field] === undefined ? '' : String(value[field])]))
        setRates(toFields(manual)); setLongRates(toFields(manual?.longContext))
        setLongEnabled(!!manual?.longContext); setThreshold(String(manual?.longContext?.aboveInputTokens ?? 200000))
        setTtl(manual?.cacheWriteTtl ?? '5m')
      }
      const key = manualPriceKey(provider, model)
      const toTier = values => ({ input: Number(values.input), cachedInput: Number(values.cachedInput), output: Number(values.output),
        ...Object.fromEntries(['cacheWrite', 'cacheWrite1h'].filter(field => values[field].trim()).map(field => [field, Number(values[field])])) })
      const entry = { currency, ...toTier(rates), cacheWriteTtl: ttl,
        ...(longEnabled ? { longContext: { ...toTier(longRates), aboveInputTokens: Number(threshold) } } : {}) }
      const filled = values => ['input', 'cachedInput', 'output'].every(field => values[field].trim() !== '')
      const ready = draft && provider.trim() && !/[:\s]/.test(provider.trim()) && model.trim()
        && key.length <= 512 && filled(rates) && (!longEnabled || filled(longRates)) && validManualPrice(entry)
      const wawa = wawaPricePreset(state.configuredModels, table)
      const importWawa = () => {
        if (!draft) return
        setDraft({ ...draft, prices: { ...draft.prices, manual: { ...table, ...wawa } } })
        setFeedback(`已填入 ${Object.keys(wawa).length} 个 Wawa 模型的人民币价格，等待自动保存。已有手填价格保留。`)
      }
      const save = () => {
        if (!ready) return
        setDraft({ ...draft, prices: { ...draft.prices, manual: { ...table, [key]: entry } } })
        setFeedback('已加入待保存设置，请确认上方显示“已自动保存”。')
      }
      const remove = key => {
        if (!draft) return
        const next = { ...table }; delete next[key]
        setDraft({ ...draft, prices: { ...draft.prices, manual: next } })
        setFeedback('已恢复该渠道和模型的自动匹配，等待自动保存。')
      }
      const resolved = model.trim() && provider.trim() ? resolveClientPrice(provider, model.trim(), config) : null
      const tier = resolved?.entry
      const input = (label, value, change, placeholder) => el('div', { className: 'cm-field' },
        el('label', null, label), el('input', { className: 'cm-input', value, placeholder, 'aria-label': label, onChange: e => change(e.target.value) }))
      const rateFields = (values, change, prefix = '', fields = ['input', 'cachedInput', 'output', 'cacheWrite']) => fields.map(field => {
        const names = { input: '输入价格', cachedInput: '缓存读取价格', output: '输出价格', cacheWrite: '普通缓存写入价格（可选）', cacheWrite1h: '1 小时缓存写入价格（可选）' }
        const label = prefix + names[field]
        return el('div', { key: field, className: 'cm-field' }, el('label', null, label),
          el('input', { className: 'cm-input', type: 'number', min: '0', step: 'any', value: values[field], 'aria-label': label,
            placeholder: field === 'cacheWrite' ? '留空按本档输入价格' : field === 'cacheWrite1h' ? '按 1 小时计价时必填' : '必填，0 表示免费',
            onChange: e => change({ ...values, [field]: e.target.value }) }))
      })
      return el('div', { className: 'um-page' }, el('style', null, css),
        el('div', { className: 'um-head' }, el('h3', null, '模型价格'), el('button', { className: 'cm-btn', onClick: () => setEditing(!editing) }, editing ? '收起编辑器' : '添加 / 编辑价格')),
        el('p', { className: 'um-muted' }, '按渠道独立计价 · 手填优先 · 每百万 Token'),
        el('input', { className: 'cm-input', style: {width:'100%'}, value: search, placeholder: '搜索渠道或模型', 'aria-label': '搜索价格', onChange: e => setSearch(e.target.value) }),
        editing ? el('div', { className: 'cm-budget', ref: editorRef },
          el('h3', { className: 'cm-h' }, '我的模型价格'),
          el('p', { className: 'cm-note' }, '手填价格优先；未手填时继续使用原版厂商识别与自动匹配。每个渠道独立计价，更新厂商价目不会覆盖这里。'),
          Object.keys(wawa).length ? el('div', null,
            el('button', { className: 'cm-btn', disabled: !draft, onClick: importWawa }, `填入 Wawa 截图价格（${Object.keys(wawa).length} 个）`),
            el('p', { className: 'cm-note' }, '2026-10-14 截图实付价 · 人民币 / 百万 Token · 已含折扣。仅匹配已配置的精确渠道与模型，保留已有手填价。缓存时长默认按普通缓存估算，可在下方调整。')) : null,
          keys.size > 0 ? el('div', { className: 'cm-field' }, el('label', null, '选择已配置 / 已使用的模型'),
            el('select', { className: 'cm-input', value: '', 'aria-label': '选择已配置 / 已使用的模型', onChange: e => select(e.target.value) },
              el('option', { value: '' }, '选择模型，或在下方直接填写'),
              [...keys].sort().map(key => el('option', { key, value: key }, key)))) : null,
          el('div', { className: 'cm-grid' },
            input('渠道 ID', provider, value => { setProvider(value); setFeedback('') }, '例如 openrouter、my-api'),
            input('模型 ID', model, value => { setModel(value); setFeedback('') }, '支持斜杠、冒号和自定义别名'),
            el('div', { className: 'cm-field' }, el('label', null, '价格币种 / 每百万 Token'),
              el('select', { className: 'cm-input', value: currency, 'aria-label': '价格币种', onChange: e => setCurrency(e.target.value) },
                el('option', { value: 'CNY' }, 'CNY · 人民币'), el('option', { value: 'USD' }, 'USD · 美元'))),
            ...rateFields(rates, setRates)),
          el('details', { className: 'cm-budget' }, el('summary', { className: 'cm-h' }, '阶梯价格与缓存时长'),
            el('p', { className: 'cm-note' }, 'DSH 当前只返回缓存写入总量，无法自动识别时长或混合写入。下面的时长用于估算；请与渠道实际缓存设置保持一致。'),
            ...rateFields(rates, setRates, '', ['cacheWrite1h']),
            el('div', { className: 'cm-field' }, el('label', null, '缓存写入计价时长'),
              el('select', { className: 'cm-input', value: ttl, 'aria-label': '缓存写入计价时长', onChange: e => setTtl(e.target.value) },
                el('option', { value: '5m' }, '普通缓存 / 5 分钟（估算）'), el('option', { value: '1h' }, '1 小时（估算）'))),
            el('label', { className: 'cm-check' }, el('input', { type: 'checkbox', checked: longEnabled, onChange: e => setLongEnabled(e.target.checked) }), '启用长上下文阶梯价'),
            longEnabled ? el('div', null,
              input('输入阈值（Token）', threshold, setThreshold, '200000'),
              el('p', { className: 'cm-note' }, '单次请求的输入 + 缓存读取 + 缓存写入严格超过阈值时，整次请求使用下档价格。输出不参与阈值。'),
              el('div', { className: 'cm-grid' }, ...rateFields(longRates, setLongRates, '超阈值 · ', ['input', 'cachedInput', 'output', 'cacheWrite', 'cacheWrite1h']))) : null),
          el('p', { className: 'cm-note' }, resolved?.priced
            ? '当前计价：' + (resolved.manual ? '手填价格' : '厂商自动匹配') + ' · ' + resolved.currency + ' / 百万 Token · 输入 ' + tier.cacheMiss + ' / 缓存 ' + tier.cacheHit + ' / 输出 ' + tier.output
            : '尚未匹配价格；可填写该渠道的实际价格。'),
          el('button', { className: 'cm-btn', disabled: !ready, onClick: save }, Object.hasOwn(table, key) ? '更新手填价格' : '添加手填价格'),
          feedback ? el('p', { className: 'cm-note', role: 'status' }, feedback) : null,
          Object.hasOwn(table, key) ? el('button', { className: 'cm-btn small', onClick: () => remove(key), disabled: !draft }, '恢复自动匹配') : null,
          el('p', { className: 'cm-note' }, '手填价支持上下文阶梯，不随峰谷变动。新调用按新价入账；历史汇总不重算。')) : null,
        ...[...new Set([...keys].map(key => key.slice(0,key.indexOf(':'))))].sort().map(channel => {
          const rows=[...keys].filter(key=>key.startsWith(channel+':')&&(key+' '+channelName(channel)).toLowerCase().includes(search.toLowerCase()))
          if(!rows.length)return null
          return el('details', { key: channel, className: 'um-panel', open: true }, el('summary', { className: 'um-panel-head' }, el('strong', null, channelName(channel)), el('span', { className: 'um-muted' }, rows.length+' 个模型')),
            el('div', { style: { padding: '0 12px' } }, ...rows.sort().map(key=>{
              const id=key.slice(channel.length+1), rate=resolveClientPrice(channel,id,config), manual=table[key]
              return el('div', { key, className: 'um-price-row' }, el('div', null, el('strong', null, id), el('span', {className:'um-muted'}, manual?'手填'+(manual.longContext?' · 阶梯价':''):rate?.priced?'自动匹配':'未配置价格')),
                el('span', {className:'um-muted',style:{whiteSpace:'nowrap'}},rate?.priced ? el(Fragment,null,
                  el('div',null,`输入 ${rate.currency==='CNY'?'¥':'$'}${rate.entry.cacheMiss}`),el('div',null,`输出 ${rate.currency==='CNY'?'¥':'$'}${rate.entry.output}`)) : '费用未知'), el('button', {className:'cm-btn small',onClick:()=>select(key)}, '编辑'))
            })))
        }),
        el('div', { className: 'cm-budget' }, el('h3', { className: 'cm-h' }, '价格更新'),
          el('label', { className: 'cm-check' }, el('input', { type: 'checkbox', checked: config.autoUpdatePrices !== false, disabled: !draft,
            onChange: e => setDraft({ ...draft, autoUpdatePrices: e.target.checked }) }), '自动更新 OpenRouter 公开价目（启动后 / 每小时）'),
          el('p', { className: 'cm-note' }, 'DeepSeek 支持下方的一键同步；其他厂商目录随插件版本更新。未启用插件自升级。网络失败保留本地价目，手填价格始终优先。')))
    }

    return { settings: CompactSettings, prices: ManualPricesPanel, overview: UsageOverview };
  }
  return { createComponents };
}});
