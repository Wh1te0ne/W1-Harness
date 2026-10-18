import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { identity } from './crypto.mjs';

/** Stateless routing only; no conversation, pairing keys, or credentials are logged or persisted. */
export function createRelay({ port = 28981, host = '0.0.0.0', maxConnections = 200 } = {}) {
  const hosts = new Map(), peers = new Map();
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'GET' && req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"service":"w1h-relay","protocol":1}'); }
    else if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('W1 Harness Relay\nService online. Pair your phone from W1 desktop.\nHealth: /healthz\n'); }
    else { res.writeHead(404); res.end(); }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2_000_000, perMessageDeflate: false });
  const send = (ws, frame) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 4_000_000) { ws.close(1013, 'Slow consumer'); return; }
    ws.send(JSON.stringify(frame));
  };
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/v1/connect' || wss.clients.size >= maxConnections) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    let auth, count = 0, bytes = 0, windowStart = Date.now(), alive = true;
    const deadline = setTimeout(() => ws.close(1008, 'Authentication required'), 10_000);
    const refreshRoutes = input => {
      if (!Array.isArray(input) || input.length > 20 || !input.every(x => /^[\w-]{43}$/.test(x))) throw new Error('Invalid routes');
      return new Set(input);
    };
    let queue = Promise.resolve();
    ws.on('pong', () => { alive = true; });
    ws.isAlive = () => { const previous = alive; alive = false; return previous; };
    ws.on('error', () => {});
    ws.on('message', raw => {
      const now = Date.now(); if (now - windowStart > 1000) { count = 0; bytes = 0; windowStart = now; }
      if (++count > 160 || (bytes += raw.length) > 8_000_000) { ws.close(1008, 'Rate limit'); return; }
      queue = queue.then(async () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const msg = JSON.parse(raw.toString());
        if (!auth) {
          if (msg.type === 'host' && await identity(msg.token) === msg.hostId) {
            if (hosts.has(msg.hostId)) throw new Error('Host already connected');
            auth = { role: 'host', hostId: msg.hostId, ws, devices: refreshRoutes(msg.devices), invites: refreshRoutes(msg.invites) };
            hosts.set(msg.hostId, auth); send(ws, { type: 'ready' });
          } else if (msg.type === 'peer' && await identity(msg.token) === msg.route) {
            const owner = hosts.get(msg.hostId);
            if (!owner || !(msg.kind === 'pair' ? owner.invites : owner.devices).has(msg.route)) { send(ws, { type: 'unavailable' }); ws.close(1008, 'Unavailable'); return; }
            if ([...peers.values()].filter(p => p.hostId === msg.hostId).length >= 12) throw new Error('Too many peers');
            if (msg.kind === 'pair' && [...peers.values()].some(p => p.route === msg.route)) throw new Error('Pairing already in progress');
            auth = { role: 'peer', peerId: randomUUID(), hostId: msg.hostId, route: msg.route, kind: msg.kind, ws };
            peers.set(auth.peerId, auth); send(ws, { type: 'ready', peerId: auth.peerId });
            send(owner.ws, { type: 'peer-open', peerId: auth.peerId, route: auth.route, kind: auth.kind });
          } else throw new Error('Authentication failed');
          clearTimeout(deadline); return;
        }
        if (auth.role === 'host') {
          if (msg.type === 'routes') {
            auth.devices = refreshRoutes(msg.devices); auth.invites = refreshRoutes(msg.invites);
            for (const peer of peers.values()) if (peer.hostId === auth.hostId && !(peer.kind === 'pair' ? auth.invites : auth.devices).has(peer.route)) peer.ws.close(1008, 'Revoked');
          } else if (msg.type === 'send' || msg.type === 'close') {
            const peer = peers.get(msg.peerId); if (!peer || peer.hostId !== auth.hostId) return;
            if (msg.type === 'close') peer.ws.close(1008, 'Closed by host'); else send(peer.ws, { type: 'data', body: msg.body });
          } else throw new Error('Unknown operation');
        } else if (msg.type === 'send') {
          const owner = hosts.get(auth.hostId); if (!owner) { ws.close(1012, 'Host offline'); return; }
          send(owner.ws, { type: 'data', peerId: auth.peerId, body: msg.body });
        } else throw new Error('Unknown operation');
      }).catch(() => ws.close(1008, 'Invalid request'));
    });
    ws.on('close', () => {
      clearTimeout(deadline);
      if (auth?.role === 'host' && hosts.get(auth.hostId) === auth) {
        hosts.delete(auth.hostId); for (const peer of peers.values()) if (peer.hostId === auth.hostId) peer.ws.close(1012, 'Host offline');
      } else if (auth?.role === 'peer') { peers.delete(auth.peerId); const owner = hosts.get(auth.hostId); if (owner) send(owner.ws, { type: 'peer-close', peerId: auth.peerId }); }
    });
  });
  const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive()) ws.terminate(); else ws.ping(); } }, 25_000);
  heartbeat.unref();
  return {
    async start() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); return server.address().port; },
    async close() { clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const relay = createRelay({ port: Number(process.env.PORT ?? 28981), host: process.env.HOST ?? '0.0.0.0' });
  relay.start().then(port => console.log(`W1 relay listening on TCP ${port}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void relay.close(); });
}
