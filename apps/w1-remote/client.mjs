import { randomToken, identity, secureChannel, socketUrl, decodePairing } from './crypto.mjs';

export class RemoteClient {
  constructor({ notify, persist, development = false }) { this.notify = notify; this.persist = persist; this.development = development; this.pending = new Map(); this.generation = 0; }
  async pair(value, name = 'Android 手机') {
    this.close(); const invite = decodePairing(value, this.development); const token = randomToken(), key = randomToken();
    this.candidate = { relay: invite.relay, hostId: invite.hostId, token, key, route: await identity(token), name };
    this.connect({ ...invite, route: invite.inviteId, key: invite.secret, kind: 'pair' });
  }
  resume(device) { this.close(); this.candidate = null; this.connect({ ...device, kind: 'device' }); }
  connect(device) {
    const generation = ++this.generation; this.device = device; this.channel = null; this.connected = false;
    this.notify({ type: 'connecting' }); const ws = this.ws = new WebSocket(socketUrl(device.relay));
    let queue = Promise.resolve();
    const timeout = setTimeout(() => ws.close(), 15_000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'peer', kind: device.kind, hostId: device.hostId, route: device.route, token: device.token }));
    ws.onmessage = event => {
      queue = queue.then(async () => {
        if (generation !== this.generation) return;
        const envelope = JSON.parse(event.data);
        if (envelope.type === 'unavailable') { this.notify({ type: 'unavailable' }); return; }
        if (envelope.type !== 'data') return;
        if (envelope.body.type === 'hello' && !this.channel) {
          const nonce = randomToken(); this.channel = await secureChannel(device.key, envelope.body.nonce, nonce, `${device.hostId}:${device.route}`, 'mobile');
          const frame = await this.channel.seal({ type: 'hello', ...(device.kind === 'pair' ? { deviceToken: this.candidate.token, key: this.candidate.key, name: this.candidate.name } : {}) });
          ws.send(JSON.stringify({ type: 'send', body: { type: 'handshake', nonce, frame } })); clearTimeout(timeout); return;
        }
        if (!this.channel) throw new Error('Missing handshake');
        const msg = await this.channel.open(envelope.body);
        if (msg.type === 'paired') {
          const saved = { ...this.candidate, hostName: msg.hostName }; await this.persist(saved); this.candidate = null;
          this.notify({ type: 'paired' }); setTimeout(() => this.resume(saved), 300); return;
        }
        if (msg.type === 'connected') { this.connected = true; clearTimeout(timeout); }
        if (msg.type === 'result' || msg.type === 'error') {
          const pending = this.pending.get(msg.id); if (pending) { clearTimeout(pending.timer); this.pending.delete(msg.id); msg.type === 'result' ? pending.resolve(msg.value) : pending.reject(new Error(msg.error)); }
        }
        this.notify(msg);
      }).catch(() => { this.notify({ type: 'error', error: '加密连接校验失败，请重连' }); ws.close(); });
    };
    ws.onerror = () => this.notify({ type: 'network-error' });
    ws.onclose = () => {
      clearTimeout(timeout); if (generation !== this.generation) return;
      this.connected = false; this.channel = null; this.rejectPending(); this.notify({ type: 'offline' });
      if (device.kind === 'device') this.retry = setTimeout(() => this.connect(device), 5000);
    };
  }
  request(action, args = {}, id = crypto.randomUUID()) {
    if (!this.connected || !this.channel) return Promise.reject(new Error('电脑未连接，消息尚未发送'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('未收到确认，请重试；重复发送不会重复执行')); }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.sendQueue = (this.sendQueue ?? Promise.resolve()).then(async () => {
        if (!this.channel || !this.connected) throw new Error('连接已断开');
        const frame = await this.channel.seal({ id, action, args }); this.ws.send(JSON.stringify({ type: 'send', body: frame }));
      }).catch(error => { clearTimeout(timer); this.pending.delete(id); reject(error); });
    });
  }
  rejectPending() { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('连接已断开，发送结果尚未确认')); } this.pending.clear(); }
  close() { this.generation++; clearTimeout(this.retry); this.ws?.close(); this.ws = null; this.channel = null; this.connected = false; this.rejectPending(); }
}
