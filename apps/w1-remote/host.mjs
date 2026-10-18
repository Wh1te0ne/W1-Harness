import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { hostname } from 'node:os';
import { DEFAULT_RELAY, randomToken, identity, secureChannel, socketUrl, relayOrigin, encodePairing } from './crypto.mjs';

/** Owns remote device credentials and calls only the explicitly supplied companion API. */
export class RemoteHost {
  constructor({ path, adapter, development = false }) {
    this.path = path; this.adapter = adapter; this.development = development;
    this.peers = new Map(); this.status = 'disabled'; this.invite = null; this.stopped = false;
    this.writeQueue = Promise.resolve(); this.failureCount = 0; this.messageQueue = Promise.resolve();
  }
  async start() {
    try { this.state = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.state = { version: 1, enabled: false, relay: DEFAULT_RELAY, token: randomToken(), devices: [] }; await this.save(); }
    if (this.state.version !== 1 || !Array.isArray(this.state.devices)) throw new Error('远程配置格式不支持，原文件已保留');
    this.state.relay = relayOrigin(this.state.relay, this.development); this.hostId = await identity(this.state.token);
    if (this.state.enabled) this.connect();
  }
  save() {
    const data = JSON.stringify(this.state, null, 2) + '\n';
    const work = this.writeQueue.then(async () => { await mkdir(dirname(this.path), { recursive: true }); const temp = this.path + '.tmp'; await writeFile(temp, data, { mode: 0o600 }); await rename(temp, this.path); });
    this.writeQueue = work.catch(() => {}); return work;
  }
  snapshot() {
    return { enabled: this.state.enabled, relay: this.state.relay, status: this.status, error: this.error ?? '', hostName: hostname(),
      devices: this.state.devices.map(({ id, name, createdAt }) => ({ id, name, createdAt, online: [...this.peers.values()].some(p => p.route === id && p.authenticated) })),
      pairing: this.invite ? { url: this.invite.url, expiresAt: this.invite.expiresAt } : null,
      pending: [...this.peers.values()].filter(p => p.pending).map(p => ({ id: p.id, name: p.pending.name })) };
  }
  async manage(action, value) {
    if (action === 'status') return this.snapshot();
    if (action === 'configure') {
      if (typeof value?.enabled !== 'boolean') throw new Error('设置无效');
      const relay = relayOrigin(value.relay, this.development);
      // A server change must not silently export paired-device traffic to a new destination.
      if (relay !== this.state.relay && this.state.devices.length) throw new Error('更换中继前请解除已有设备绑定');
      this.state.enabled = value.enabled; this.state.relay = relay; await this.save(); this.disconnect(); if (value.enabled) this.connect();
    } else if (action === 'pair') {
      if (this.status !== 'online') throw new Error('中继尚未连接，请先检查域名和服务');
      clearTimeout(this.inviteTimer); const token = randomToken(), id = await identity(token), secret = randomToken();
      const expiresAt = Date.now() + 5 * 60_000;
      this.invite = { id, secret, expiresAt, url: encodePairing({ v: 1, relay: this.state.relay, hostId: this.hostId, inviteId: id, token, secret, expiresAt }) };
      this.routes(); this.inviteTimer = setTimeout(() => { this.invite = null; this.routes(); }, 5 * 60_000); this.inviteTimer.unref?.();
    } else if (action === 'approve' || action === 'reject') {
      const peer = this.peers.get(value?.id); if (!peer?.pending || !this.invite || this.invite.expiresAt < Date.now()) throw new Error('配对请求已失效');
      if (action === 'approve') {
        if (this.state.devices.length >= 10) throw new Error('最多绑定 10 台设备');
        const device = { id: peer.pending.id, key: peer.pending.key, name: peer.pending.name, createdAt: Date.now() };
        if (this.state.devices.some(d => d.id === device.id)) throw new Error('设备已存在');
        this.state.devices.push(device); await this.save(); await this.sendPeer(peer, { type: 'paired', hostName: hostname() });
      } else await this.sendPeer(peer, { type: 'rejected' });
      this.invite = null; clearTimeout(this.inviteTimer); this.routes();
    } else if (action === 'revoke') {
      this.state.devices = this.state.devices.filter(d => d.id !== value?.id); await this.save();
      for (const peer of this.peers.values()) if (peer.route === value?.id) this.closePeer(peer.id); this.routes();
    } else throw new Error('不支持的操作');
    return this.snapshot();
  }
  wire(frame) { if (this.ws?.readyState === WebSocket.OPEN) { if (this.ws.bufferedAmount > 4_000_000) { this.ws.close(); return; } this.ws.send(JSON.stringify(frame)); } }
  routes() { this.wire({ type: 'routes', devices: this.state.devices.map(d => d.id), invites: this.invite ? [this.invite.id] : [] }); }
  retryLater() {
    this.status = this.state.enabled ? 'offline' : 'disabled';
    if (!this.stopped && this.state.enabled) this.retry = setTimeout(() => this.connect(), Math.min(30_000, 1000 * 2 ** Math.min(this.failureCount++, 5)));
  }
  async connect() {
    if (this.stopped || !this.state.enabled || this.attempt) return;
    const attempt = this.attempt = new AbortController();
    this.status = 'connecting'; this.error = '';
    try {
      const response = await fetch(this.state.relay + '/healthz', { redirect: 'error', signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('中继健康检查返回 HTTP ' + response.status + '，请检查域名反向代理是否指向 W1 中继的 28981 端口'), { code: 'W1_HEALTH' }); }
      const health = await response.json().catch(() => null);
      if (health?.ok !== true || health.service !== 'w1h-relay' || health.protocol !== 1) throw Object.assign(new Error('此地址未返回兼容的 W1 中继，请检查域名和反向代理后端'), { code: 'W1_HEALTH' });
    } catch (error) {
      if (attempt.signal.aborted) return;
      const code = error.cause?.code;
      this.error = code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? '中继域名解析失败，请检查 DNS 和网络连接'
        : error.name === 'TimeoutError' ? '中继连接超时，请检查网络、公网端口和服务状态'
        : code?.includes('CERT') || code?.startsWith('ERR_TLS') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ? '中继 HTTPS 证书验证失败，请检查证书域名、有效期和完整证书链'
        : error.code === 'W1_HEALTH' ? error.message : '无法访问中继 HTTPS，请检查网络、公网端口和 NAS 服务';
      this.attempt = null; this.retryLater(); return;
    }
    if (attempt.signal.aborted) return;
    const ws = this.ws = new WebSocket(socketUrl(this.state.relay));
    const startup = setTimeout(() => { if (this.ws === ws) this.error = '中继未完成 WebSocket 握手，请检查 /v1/connect 转发'; ws.close(); }, 15_000);
    ws.addEventListener('open', () => { if (this.ws === ws) this.wire({ type: 'host', hostId: this.hostId, token: this.state.token, devices: this.state.devices.map(d => d.id), invites: this.invite ? [this.invite.id] : [] }); });
    ws.addEventListener('message', event => {
      this.messageQueue = this.messageQueue.then(async () => { if (this.ws !== ws) return; const msg = JSON.parse(event.data); if (msg.type === 'ready') clearTimeout(startup); await this.receive(msg); }).catch(() => { if (this.ws === ws) this.error = '连接数据异常，正在重连'; ws.close(); });
    });
    ws.addEventListener('error', () => { if (this.ws === ws) this.error = '中继 HTTPS 正常，但 WebSocket 连接失败，请检查 /v1/connect 的 Upgrade 转发'; });
    ws.addEventListener('close', () => {
      clearTimeout(startup); if (this.ws !== ws) return; this.ws = null; this.attempt = null;
      for (const id of [...this.peers.keys()]) this.closePeer(id);
      if (!this.error) this.error = '中继连接已断开，正在自动重连';
      this.retryLater();
    });
  }
  async receive(msg) {
    if (msg.type === 'ready') { this.status = 'online'; this.error = ''; this.failureCount = 0; return; }
    if (msg.type === 'peer-close') { this.closePeer(msg.peerId); return; }
    if (msg.type === 'peer-open') {
      const pair = msg.kind === 'pair'; const secret = pair ? (this.invite?.id === msg.route && this.invite.expiresAt > Date.now() ? this.invite.secret : null) : this.state.devices.find(d => d.id === msg.route)?.key;
      if (!secret || this.peers.size >= 12) { this.wire({ type: 'close', peerId: msg.peerId }); return; }
      const peer = { id: msg.peerId, route: msg.route, pair, secret, nonce: randomToken(), sendQueue: Promise.resolve(), requests: 0 };
      peer.deadline = setTimeout(() => this.closePeer(peer.id), 15_000); this.peers.set(peer.id, peer);
      this.wire({ type: 'send', peerId: peer.id, body: { type: 'hello', nonce: peer.nonce } }); return;
    }
    if (msg.type !== 'data') return;
    const peer = this.peers.get(msg.peerId); if (!peer) return;
    try {
      if (!peer.channel) {
        if (msg.body?.type !== 'handshake') throw new Error('Handshake required');
        peer.channel = await secureChannel(peer.secret, peer.nonce, msg.body.nonce, `${this.hostId}:${peer.route}`, 'host');
        const hello = await peer.channel.open(msg.body.frame); if (hello.type !== 'hello') throw new Error('Handshake failed');
        clearTimeout(peer.deadline); peer.authenticated = true;
        if (peer.pair) {
          if (!this.invite || this.invite.expiresAt < Date.now()) throw new Error('Pairing expired');
          const id = await identity(hello.deviceToken); await identity(hello.key);
          peer.pending = { id, key: hello.key, name: String(hello.name ?? 'Android 手机').slice(0, 60) };
          await this.sendPeer(peer, { type: 'pending' });
        } else { await this.sendPeer(peer, { type: 'connected', hostName: hostname() }); }
        return;
      }
      const request = await peer.channel.open(msg.body);
      if (peer.pair) throw new Error('Pairing cannot invoke commands');
      if (++peer.requests > 10) throw new Error('Too many concurrent requests');
      // Admission order is preserved; long-running persistence reads do not block other devices.
      void this.dispatch(peer, request).finally(() => { peer.requests--; });
    } catch { this.closePeer(peer.id); }
  }
  sendPeer(peer, payload) {
    const work = peer.sendQueue.then(async () => { if (!this.peers.has(peer.id)) return; const body = await peer.channel.seal(payload); this.wire({ type: 'send', peerId: peer.id, body }); });
    peer.sendQueue = work.catch(() => { this.closePeer(peer.id); }); return work;
  }
  async dispatch(peer, request) {
    const { id, action, args = {} } = request ?? {};
    if (typeof id !== 'string' || id.length > 100) { this.closePeer(peer.id); return; }
    try {
      if (action === 'watch') {
        peer.watch?.abort(); const watch = peer.watch = new AbortController();
        await this.sendPeer(peer, { type: 'result', id, value: true });
        try { for await (const frame of this.adapter.follow(args, watch.signal)) await this.sendPeer(peer, { type: 'event', id, frame }); }
        catch (error) { if (!watch.signal.aborted) await this.sendPeer(peer, { type: 'stream-error', id, error: String(error.message).slice(0, 300) }); }
      } else if (action === 'unwatch') { peer.watch?.abort(); await this.sendPeer(peer, { type: 'result', id, value: true }); }
      else {
        const value = await this.adapter.invoke(action, args);
        await this.sendPeer(peer, { type: 'result', id, value });
      }
    } catch (error) { await this.sendPeer(peer, { type: 'error', id, error: String(error.message).slice(0, 300) }).catch(() => {}); }
  }
  closePeer(id) { const peer = this.peers.get(id); if (!peer) return; peer.watch?.abort(); clearTimeout(peer.deadline); this.peers.delete(id); this.wire({ type: 'close', peerId: id }); }
  disconnect() { this.attempt?.abort(); this.attempt = null; clearTimeout(this.retry); clearTimeout(this.inviteTimer); this.invite = null; for (const id of [...this.peers.keys()]) this.closePeer(id); const ws = this.ws; this.ws = null; ws?.close(); this.status = 'disabled'; }
  stop() { this.stopped = true; this.disconnect(); }
}
