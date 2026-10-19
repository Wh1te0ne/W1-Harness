/** Phone pairing and management in the shared W1 Settings surface. */
const { createElement: h, useState, useEffect, useRef } = require('react');
const inject = ['slots', 'locale'];
function RemoteSettings({ bridge }) {
  const [state,setState]=useState(null),[relay,setRelay]=useState(''),[enabled,setEnabled]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(null);
  const mounted=useRef(false),initialized=useRef(false),pending=useRef(0),queue=useRef(Promise.resolve());
  async function invoke(action,value) {
    if(action==='status'&&pending.current)return;
    pending.current++;if(action!=='status')setBusy(true);
    const operation=async()=>{try {
      const next=await bridge.manage(action,value);
      if(!mounted.current)return;
      if(next){setState(next);if(!initialized.current){setRelay(next.relay);setEnabled(next.enabled);initialized.current=true;}}
      setError('');if(action==='configure')setNotice('连接设置已保存');if(action==='copy')setNotice('配对信息已复制');
      if(action==='revoke')setConfirm(null);
    }catch(reason){if(mounted.current)setError(String(reason.message||reason).replace(/^Error invoking remote method[^:]*:/,''));}
    finally {pending.current--;if(mounted.current)setBusy(pending.current>0);}};
    queue.current=queue.current.then(operation,operation);return queue.current;
  }
  useEffect(()=>{mounted.current=true;void invoke('status');const timer=setInterval(()=>{void invoke('status')},2000);return()=>{mounted.current=false;clearInterval(timer)}},[]);
  const button=(text,action,primary=false)=>h('button',{type:'button',className:primary?'w1-remote-primary':'',disabled:busy,onClick:action},text);
  const status={online:'中继已连接',offline:'连接中断',connecting:'正在连接',disabled:'已关闭'}[state?.status]||'读取中';
  return h('section',{className:'w1-remote-settings'},
    h('h2',null,'远程连接'),h('p',{className:'w1-remote-description'},'连接手机，查看同一份会话并继续发送消息。使用时电脑需保持运行。'),
    h('div',{className:'w1-remote-card'},
      h('div',{className:'w1-remote-row'},h('label',{className:'w1-remote-toggle'},h('input',{type:'checkbox',checked:enabled,disabled:!state||busy,onChange:e=>setEnabled(e.target.checked)}),'允许已绑定的手机连接'),h('span',{className:'w1-remote-status','data-state':state?.status},status)),
      h('label',{className:'w1-remote-field'},h('span',null,'中继地址'),h('input',{type:'url',value:relay,placeholder:'https://',disabled:!state,onChange:e=>setRelay(e.target.value)})),
      button('保存连接设置',()=>{void invoke('configure',{relay,enabled})},true),
      (error||state?.error)&&h('p',{role:'alert',className:'w1-remote-error'},error||state.error)),
    h('div',{className:'w1-remote-card'},h('h3',null,'连接新手机'),h('p',{className:'w1-remote-description'},'二维码有效期 5 分钟。扫码后在此确认设备，后续无需重复配对。'),
      h('div',{className:'w1-remote-actions'},button('生成配对二维码',()=>{setNotice('');void invoke('pair')},true),state?.pairing&&button('复制配对信息',()=>{void invoke('copy')})),
      state?.qrDataUrl&&h('div',{className:'w1-remote-qr'},h('img',{src:state.qrDataUrl,alt:'手机配对二维码',width:220,height:220}),h('p',null,'有效至 '+new Date(state.pairing.expiresAt).toLocaleTimeString())),
      (state?.pending||[]).map(device=>h('div',{className:'w1-remote-pending',key:device.id},h('p',null,device.name+' 请求连接你的 W1'),h('div',{className:'w1-remote-actions'},button('允许连接',()=>{void invoke('approve',{id:device.id})},true),button('拒绝',()=>{void invoke('reject',{id:device.id})}))))),
    h('div',{className:'w1-remote-card'},h('h3',null,'已绑定设备'),state&&!state.devices.length&&h('p',{className:'w1-remote-description'},'尚未绑定手机'),
      (state?.devices||[]).map(device=>h('div',{className:'w1-remote-device',key:device.id},h('div',null,h('span',null,device.name),h('small',null,device.online?'在线':'离线')),confirm===device.id?h('div',{className:'w1-remote-actions'},button('确认解除',()=>{void invoke('revoke',{id:device.id})}),button('取消',()=>setConfirm(null))):button('解除绑定',()=>setConfirm(device.id))))),
    h('p',{role:'status',className:'w1-remote-description'},notice));
}
function apply(ctx) {
  const bridge=globalThis.dshDesktop?.remote;
  if(typeof bridge?.manage!=='function')return;
  ctx.effect(()=>ctx.locale.register('w1-remote',{zh:{entry:'远程连接'},en:{entry:'Remote connection'}}),'w1-remote: settings dictionaries');
  ctx.effect(()=>{const style=document.createElement('style');style.textContent=`
.w1-remote-settings{display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}.w1-remote-settings h2{font-size:22px;font-weight:550;margin:0 0 4px}.w1-remote-settings h3{font-size:14px;font-weight:550;margin:0 0 10px}.w1-remote-description{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary);margin:0}.w1-remote-card{padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.w1-remote-row,.w1-remote-device{display:flex;align-items:center;justify-content:space-between;gap:12px}.w1-remote-toggle{display:flex;align-items:center;gap:8px;font-size:13px}.w1-remote-toggle input{accent-color:var(--dsw-alias-state-business-primary)}.w1-remote-status{font-size:11px;padding:5px 8px;border-radius:16px;white-space:nowrap;background:var(--dsw-alias-bg-module-platform)}.w1-remote-status[data-state=online]{color:var(--dsw-alias-state-business-primary)}.w1-remote-field{display:flex;flex-direction:column;gap:8px;font-size:12px;margin:18px 0 12px}.w1-remote-field input{font:inherit;font-size:13px;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px;min-width:0}.w1-remote-settings button{font:inherit;font-size:12px;color:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;padding:7px 11px;cursor:pointer}.w1-remote-settings button:disabled{opacity:.5;cursor:wait}.w1-remote-settings .w1-remote-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);border-color:transparent}.w1-remote-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.w1-remote-error{font-size:12px;color:#c44545;line-height:1.6;margin:10px 0 0}.w1-remote-qr{text-align:center;margin:16px 0}.w1-remote-qr img{background:white;padding:8px;border-radius:8px;max-width:100%;height:auto}.w1-remote-qr p{font-size:12px}.w1-remote-pending{padding:12px;border-radius:10px;background:var(--dsw-alias-bg-module-platform);font-size:13px;margin-top:12px}.w1-remote-device{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px}.w1-remote-device:last-child{border-bottom:0;padding-bottom:0}.w1-remote-device small{display:block;color:var(--dsw-alias-label-secondary);font-size:11px;margin-top:4px}`;document.head.append(style);return()=>style.remove()},'w1-remote: settings styles');
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'w1-remote',order:65,locale:'w1-remote',label:()=>ctx.locale.bind('w1-remote')('entry'),inject:()=>({bridge})},RemoteSettings));
}
