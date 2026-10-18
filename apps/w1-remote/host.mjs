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
  connect() {
    if (this.stopped || !this.state.enabled) return;
    this.status = 'connecting'; this.error = '';
    const ws = this.ws = new WebSocket(socketUrl(this.state.relay));
    const startup = setTimeout(() => ws.close(), 15_000);
    ws.addEventListener('open', () => { if (this.ws === ws) this.wire({ type: 'host', hostId: this.hostId, token: this.state.token, devices: this.state.devices.map(d => d.id), invites: this.invite ? [this.invite.id] : [] }); });
    ws.addEventListener('message', event => {
      this.messageQueue = this.messageQueue.then(async () => { if (this.ws !== ws) return; const msg = JSON.parse(event.data); await this.receive(msg); }).catch(() => { this.error = '连接数据异常，正在重连'; ws.close(); });
    });
    ws.addEventListener('error', () => { this.error = '无法连接中继，请检查 HTTPS 证书、端口和 WebSocket 转发'; });
    ws.addEventListener('close', () => {
      clearTimeout(startup); if (this.ws !== ws) return; this.ws = null; this.status = this.state.enabled ? 'offline' : 'disabled';
      for (const id of [...this.peers.keys()]) this.closePeer(id);
      if (!this.stopped && this.state.enabled) this.retry = setTimeout(() => this.connect(), Math.min(30_000, 1000 * 2 ** Math.min(this.failureCount++, 5)));
    });
  }
  async receive(msg) {
    if (msg.type === 'ready') { this.status = 'online'; this.failureCount = 0; return; }
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
  disconnect() { clearTimeout(this.retry); clearTimeout(this.inviteTimer); this.invite = null; for (const id of [...this.peers.keys()]) this.closePeer(id); const ws = this.ws; this.ws = null; ws?.close(); this.status = 'disabled'; }
  stop() { this.stopped = true; this.disconnect(); }
}
