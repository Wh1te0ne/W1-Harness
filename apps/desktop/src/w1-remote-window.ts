/** Device pairing is approved only inside an isolated desktop-owned window. */
import { BrowserWindow, clipboard, ipcMain } from 'electron'
import { pairingQr } from '@w1h/remote/qr'

/** Own one device manager and authorize IPC by exact window/frame identity. */
export class W1RemoteWindow {
  private window: BrowserWindow | undefined
  constructor(private readonly preload: string, private readonly manage: (action: string, value?: unknown) => Promise<unknown>) {
    ipcMain.handle('w1-remote:manage', async (event, action: unknown, value: unknown) => {
      if (this.window === undefined || event.sender !== this.window.webContents || event.senderFrame !== this.window.webContents.mainFrame
        || typeof action !== 'string' || !['status', 'configure', 'pair', 'approve', 'reject', 'revoke', 'copy'].includes(action)) throw new Error('远程设备窗口验证失败')
      const result = await this.manage(action === 'copy' ? 'status' : action, value) as { pairing?: { url: string }; [key: string]: unknown }
      if (action === 'copy') { if (result.pairing?.url) clipboard.writeText(result.pairing.url); return null }
      return { ...result, qr: result.pairing?.url ? pairingQr(result.pairing.url) : null }
    })
  }
  /** Open or focus the pairing surface without enabling remote access implicitly. */
  open(): void {
    if (this.window !== undefined) { this.window.show(); this.window.focus(); return }
    const window = this.window = new BrowserWindow({ width: 560, height: 780, minWidth: 460, minHeight: 620, title: 'W1 · 远程设备',
      autoHideMenuBar: true, backgroundColor: '#f5f6f7', webPreferences: { preload: this.preload, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => { event.preventDefault() })
    window.on('closed', () => { this.window = undefined })
    void window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE))
  }
}

const PAGE = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>W1 · 远程设备</title><style>
*{box-sizing:border-box}body{margin:0;padding:30px;font:14px system-ui,'Segoe UI','Microsoft YaHei',sans-serif;background:#f5f6f7;color:#232831}h1{font-size:26px;font-weight:550;margin:8px 0 12px}h2{font-size:15px}p{line-height:1.7;color:#7c838e;font-size:12px}.eyebrow{font-size:10px;letter-spacing:3px;color:#7c838e}.card{background:white;padding:20px;border:1px solid #e5e8ed;border-radius:18px;margin:18px 0}input[type=url]{width:100%;padding:11px;border:1px solid #e5e8ed;border-radius:9px;margin:10px 0}button{font:inherit;padding:9px 13px;border:1px solid #e2e5e9;border-radius:9px;background:white;cursor:pointer;margin:5px 5px 5px 0}.primary{background:#273140;color:white;border-color:#273140}.row{display:flex;align-items:center;justify-content:space-between;gap:10px}.badge{padding:5px 9px;border-radius:20px;background:#eef1f4;font-size:11px}#qr{text-align:center}#qr svg{width:260px;max-width:100%;height:auto}#error{color:#b3473c;min-height:20px}#pending .item{background:#f0f5fa;border-radius:12px;padding:14px;margin-top:8px}.device{padding:10px 0;border-bottom:1px solid #eee}.hidden{display:none}label{font-size:13px}small{color:#7c838e}</style>
<div class="eyebrow">W1 HARNESS / REMOTE</div><h1>工作，随身连接。</h1><p>扫码绑定手机，查看同一份会话并继续发送消息。电脑需保持运行。</p>
<div class="card"><div class="row"><label><input type="checkbox" id="enabled"> 允许已绑定的手机连接</label><span id="status" class="badge">读取中</span></div><input id="relay" type="url" placeholder="HTTPS 中继地址"><button id="save" class="primary">保存连接设置</button><p id="error"></p></div>
<div class="card"><h2>连接新手机</h2><p>二维码有效期 5 分钟。扫码后在此确认设备，后续无需重复配对。</p><button id="pair" class="primary">生成配对二维码</button><button id="copy">复制配对信息</button><div id="qr"></div><p id="expiry"></p><div id="pending"></div></div>
<div class="card"><h2>已绑定设备</h2><div id="devices"></div></div>
<script>const $=id=>document.getElementById(id);let initialized=false,busy=false;async function invoke(action,value){try{const s=await window.w1Remote.invoke(action,value);if(s)render(s);return s}catch(e){$('error').textContent=e.message.replace(/^Error invoking remote method[^:]*:/,'')}}function render(s){if(!initialized){$('relay').value=s.relay;$('enabled').checked=s.enabled;initialized=true}$('status').textContent={online:'中继已连接',offline:'连接中断',connecting:'正在连接',disabled:'已关闭'}[s.status]||s.status;$('error').textContent=s.error||'';$('qr').innerHTML=s.qr||'';$('expiry').textContent=s.pairing?'有效至 '+new Date(s.pairing.expiresAt).toLocaleTimeString():'';$('pending').replaceChildren();for(const p of s.pending){const el=document.createElement('div');el.className='item';const label=document.createElement('p');label.textContent=p.name+' 请求连接你的 W1';el.append(label);for(const [a,t]of [['approve','允许连接'],['reject','拒绝']]){const b=document.createElement('button');b.textContent=t;b.onclick=()=>invoke(a,{id:p.id});el.append(b)}$('pending').append(el)}$('devices').replaceChildren();if(!s.devices.length)$('devices').textContent='尚未绑定手机';for(const d of s.devices){const el=document.createElement('div');el.className='device row';const label=document.createElement('span');label.textContent=d.name+(d.online?' · 在线':' · 离线');const b=document.createElement('button');b.textContent='解除绑定';b.onclick=()=>{if(confirm('解除 '+d.name+' 的访问权限？'))invoke('revoke',{id:d.id})};el.append(label,b);$('devices').append(el)}}$('save').onclick=async()=>{await invoke('configure',{relay:$('relay').value,enabled:$('enabled').checked})};$('pair').onclick=()=>invoke('pair');$('copy').onclick=()=>invoke('copy');async function poll(){if(busy)return;busy=true;try{await invoke('status')}finally{busy=false}}poll();setInterval(poll,1800);</script></html>`
