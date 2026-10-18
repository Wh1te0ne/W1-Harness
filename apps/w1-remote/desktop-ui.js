/** Desktop-only sidebar entry. No pairing credentials cross this UI bridge. */
const { createElement: h, useState } = require('react');
const inject = ['slots', 'locale'];
const NS = 'w1-remote';
const dictionaries = { zh: { entry: '手机连接', failed: '无法打开，请从应用菜单重试' }, en: { entry: 'Phone connection', failed: 'Could not open. Try the application menu.' } };
function RemoteEntry({ wide, openRemote, t }) {
  const [failed, setFailed] = useState(false);
  const label = t('entry');
  return h('div', {className:'w1-phone-entry'},
    h('button', {type:'button',className:wide?'w1-phone-button':'w1-phone-button w1-phone-rail',title:label,'aria-label':label,
      onClick:()=>{setFailed(false);void openRemote().catch(()=>setFailed(true));}},
      h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,'aria-hidden':true},
        h('rect',{x:6,y:2,width:12,height:20,rx:2.5}),h('path',{d:'M10 18h4'})), wide&&h('span',null,label)),
    failed&&h('span',{role:'alert',className:'w1-phone-error'},t('failed')));
}
function apply(ctx) {
  const bridge = globalThis.dshDesktop;
  if (bridge?.protocolVersion !== 1 || typeof bridge.remote?.open !== 'function') return;
  ctx.effect(()=>ctx.locale.register(NS,dictionaries),'w1-remote: dictionaries');
  ctx.effect(()=>{
    const style=document.createElement('style');
    style.textContent='.w1-phone-entry{width:100%}.w1-phone-button{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:0 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;cursor:pointer;text-align:left}.w1-phone-button:hover{background:var(--dsw-alias-interactive-bg-hover)}.w1-phone-button svg{flex:none}.w1-phone-rail{width:36px;padding:0;justify-content:center}.w1-phone-error{display:block;font-size:12px;padding:4px 8px;color:var(--dsw-alias-label-primary)}';
    document.head.append(style);return()=>style.remove();
  },'w1-remote: sidebar styles');
  ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'w1-phone-connection',order:90,locale:NS,
    inject:()=>({openRemote:()=>bridge.remote.open()})},RemoteEntry));
}
