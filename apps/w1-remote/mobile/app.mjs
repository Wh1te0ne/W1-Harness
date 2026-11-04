import { RemoteClient } from './client.mjs';
import { createTranscript } from './transcript.mjs';
const $ = id => document.getElementById(id);
const load = key => { try { return JSON.parse(window.W1Native ? W1Native.load(key) : localStorage.getItem('w1h-' + key)); } catch { return null; } };
const save = (key, value) => { const text = JSON.stringify(value); if (window.W1Native) W1Native.save(key, text); else localStorage.setItem('w1h-' + key, text); };
let device = load('device'), catalog, active, page = 'pair', watchId, cursor = 0, messages = [], liveText = '', liveReasoning = '', liveProgress = '', sendReceipt = load('outbox'), poll;
const transcript = createTranscript($('history'), $('live'));
function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.add('hidden'), 4500); }
function show(name) { page = name; for (const id of ['pair','list','chat','device']) $(id).classList.toggle('hidden', id !== name); $('back').classList.toggle('hidden', name === 'pair' || name === 'list'); }
function connection(text, online = false) { $('connection').textContent = text; $('connection').classList.toggle('online', online); $('send').disabled = !online; }
const client = new RemoteClient({ persist: async value => { device = value; save('device', value); }, notify: event => {
  if (event.type === 'connecting') connection('正在连接');
  if (event.type === 'connected') { connection('已连接', true); $('hostName').textContent = event.hostName; $('deviceName').textContent = event.hostName; $('relayAddress').textContent = device?.relay ?? ''; if (page === 'pair') show('list'); void refresh(); clearInterval(poll); poll = setInterval(refresh, 5000); if (active) void watch(); }
  if (event.type === 'offline') { connection('电脑离线'); clearInterval(poll); }
  if (event.type === 'network-error') connection('连接失败');
  if (event.type === 'unavailable') { connection('电脑不可用'); $('pairStatus').textContent = '电脑未上线、配对码已失效，或绑定已被解除。'; }
  if (event.type === 'pending') $('pairStatus').textContent = '已找到电脑，请在电脑「远程设备」中确认连接。';
  if (event.type === 'rejected') { $('pairStatus').textContent = '电脑拒绝了此次配对，请重新扫码。'; client.close(); }
  if (event.type === 'paired') toast('配对成功，正在连接你的工作');
  if (event.type === 'stream-error') toast(event.error);
  if (event.type === 'event' && event.id === watchId) applyFrame(event.frame);
}});
async function refresh() { if (!client.connected) return; try { catalog = await client.request('catalog'); renderProjects(); if (active) { const s = catalog.sessions.find(s => s.id === active.id); $('taskState').textContent = s?.running ? '正在执行' : '等待下一条消息'; } } catch (e) { if (client.connected) toast(e.message); } }
function renderProjects() {
  if (!catalog) return; const term = $('search').value.trim().toLowerCase(); $('projects').replaceChildren();
  for (const project of catalog.projects) {
    const items = catalog.sessions.filter(s => project.sessionIds.includes(s.id) && s.title.toLowerCase().includes(term));
    if (term && !items.length) continue;
    const section = document.createElement('div'); section.className = 'project';
    const heading = document.createElement('div'); heading.className = 'project-title'; const title = document.createElement('span'); title.textContent = project.title; heading.append(title);
    const add = document.createElement('button'); add.className = 'quiet'; add.textContent = '+ 新会话'; add.onclick = async () => { try { const value = await client.request('create', { workspaceId: project.id }); await refresh(); openChat({ id: value.sessionId, title: '新会话' }); } catch(e) { toast(e.message); } }; heading.append(add); section.append(heading);
    for (const s of items) { const row = document.createElement('button'); row.className = 'session'; const name = document.createElement('strong'); name.textContent = s.title; const meta = document.createElement('small'); meta.textContent = (s.running ? '● 正在执行 · ' : '') + new Date(s.updatedAt).toLocaleString('zh-CN', { month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' }); if(s.running) meta.className = 'running-dot'; row.append(name,meta); row.onclick=()=>openChat(s); section.append(row); }
    if (!items.length) { const empty=document.createElement('p'); empty.className='empty'; empty.textContent='还没有会话'; section.append(empty); }
    $('projects').append(section);
  }
}
function openChat(session) { if (active) save('draft-' + active.id, $('draft').value); active=session; $('chatTitle').textContent=session.title; $('draft').value=sendReceipt?.sessionId === session.id ? sendReceipt.text : load('draft-'+session.id) ?? ''; $('sendState').textContent=sendReceipt?.sessionId === session.id ? '上次发送未确认，可重试' : ''; messages=[]; liveText=''; liveReasoning=''; liveProgress=''; transcript.reset(); renderMessages(); show('chat'); void watch(); }
async function watch() { if (!active || !client.connected) return; watchId=crypto.randomUUID(); try { await client.request('watch',{sessionId:active.id},watchId); } catch(e) { toast(e.message); } }
function applyFrame(frame) {
  const scroll=$('messages'), atBottom=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100;
  const firstSnapshot = frame.type==='snapshot' && messages.length===0;
  if(frame.type==='snapshot') { messages=frame.messages; cursor=frame.cursor; liveText=frame.live??''; liveReasoning=frame.reasoning??''; liveProgress=frame.progress??''; $('older').classList.toggle('hidden', !frame.hasMore); if(frame.title) $('chatTitle').textContent=frame.title; }
  if(frame.type==='event') {
    cursor=frame.cursor;
    if(frame.message) {
      messages=messages.filter(m=>m.seq!==frame.message.seq); messages.push(frame.message);
      if(['assistant','hidden','status'].includes(frame.message.role)) { liveText=''; liveReasoning=''; liveProgress=''; }
      if(frame.message.kind==='call') liveProgress='正在执行 '+frame.message.text.split('\n')[0].replace(/^调用 /,'');
      if(frame.message.kind==='result') liveProgress='工具已返回，继续处理中';
    }
  }
  if(frame.type==='live') {
    if(frame.operation==='start'||frame.operation==='end') { liveText=''; liveReasoning=''; liveProgress=frame.progress??''; }
    else {
      liveText=appendLive(liveText,frame.text??''); liveReasoning=appendLive(liveReasoning,frame.reasoning??'');
      if(frame.progress) liveProgress=frame.progress;
    }
  }
  renderMessages(); if(atBottom||firstSnapshot) scroll.scrollTop=scroll.scrollHeight;
}
function appendLive(current, delta) {
  const limit=30_000, marker='\n[内容过长，已截断；完整内容请在电脑查看]';
  if(current.length>limit) return current;
  const next=current+delta; return next.length>limit ? next.slice(0,limit)+marker : next;
}
function renderMessages() {
  transcript.render(messages,{text:liveText,reasoning:liveReasoning,progress:liveProgress});
}
$('older').onclick=async()=>{ try { const value=await client.request('page',{sessionId:active.id,throughSeq:cursor,beforeSeq:Math.min(...messages.map(m=>m.seq))}); const old=$('messages').scrollHeight; messages=[...value.messages,...messages];renderMessages();$('messages').scrollTop += $('messages').scrollHeight-old;$('older').classList.toggle('hidden',!value.hasMore);}catch(e){toast(e.message);} };
$('composer').onsubmit=async event=>{
  event.preventDefault();const text=$('draft').value.trim();if(!text||!active)return;
  if(sendReceipt && sendReceipt.sessionId===active.id && sendReceipt.text!==text && !confirm('上次消息未收到确认。发送不同内容可能产生另一条消息，继续吗？'))return;
  if(!sendReceipt||sendReceipt.text!==text||sendReceipt.sessionId!==active.id)sendReceipt={sessionId:active.id,requestId:crypto.randomUUID(),text,mode:$('delivery').value};
  save('outbox',sendReceipt);$('send').disabled=true;$('sendState').textContent='正在发送…';
  try{await client.request('prompt',{...sendReceipt,clientTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});sendReceipt=null;save('outbox',null);$('draft').value='';save('draft-'+active.id,'');$('sendState').textContent='电脑已接收';}
  catch(e){$('sendState').textContent='未确认 · 可重试';toast(e.message);}finally{$('send').disabled=!client.connected;}
};
$('draft').oninput=()=>{if(active)save('draft-'+active.id,$('draft').value);};
$('stop').onclick=async()=>{if(!active||!confirm('停止电脑上这个会话的当前任务？'))return;try{await client.request('cancel',{sessionId:active.id});toast('已请求停止');}catch(e){toast(e.message);}};
async function pair(value){try{$('pairStatus').textContent='正在安全配对…';await client.pair(value,window.W1Native?W1Native.deviceName():'浏览器客户端');}catch(e){$('pairStatus').textContent=e.message;}}
window.w1ScanResult=value=>{if(value)void pair(value);};
$('scan').onclick=()=>{if(window.W1Native)W1Native.scan();else{$('pairText').closest('details').open=true;$('pairText').focus();toast('浏览器预览请粘贴配对信息，APK 支持扫码');}};
$('pairSubmit').onclick=()=>pair($('pairText').value);
$('refresh').onclick=refresh;$('search').oninput=renderProjects;
$('settings').onclick=()=>{if(device){$('deviceName').textContent=device.hostName??'我的电脑';$('relayAddress').textContent=device.relay;show('device');}else show('pair');};
$('back').onclick=()=>{if(page==='chat'){client.request('unwatch').catch(()=>{});active=null;}show(device?'list':'pair');};
$('reconnect').onclick=()=>{if(device)client.resume(device);};
$('forget').onclick=()=>{if(confirm('移除这台手机保存的绑定？')){client.close();device=null;save('device',null);active=null;clearInterval(poll);show('pair');connection('未连接');}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&device&&!client.connected)client.resume(device);});
if(device){show('list');client.resume(device);}else show('pair');
