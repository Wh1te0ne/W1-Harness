import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteHost } from '../host.mjs';
import { createRelay } from '../relay.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 300; i++) { if (fn()) return; await pause(20); } throw Error('Timed out'); }
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'w1h-connection-'));
  const host = new RemoteHost({ path: join(directory, 'devices.json'), adapter: {}, development: true });
  t.after(async () => { host.stop(); await rm(directory, { recursive: true, force: true }); });
  await host.start(); return host;
}
const healthy = JSON.stringify({ ok: true, service: 'w1h-relay', protocol: 1 });

test('a ready relay stays connected beyond the handshake deadline', async t => {
  const relay = createRelay({ port: 0, host: '127.0.0.1' });
  const port = await relay.start(); t.after(() => relay.close());
  const host = await fixture(t);
  await host.manage('configure', { enabled: true, relay: 'http://127.0.0.1:' + port });
  await until(() => host.status === 'online'); const socket = host.ws;
  await pause(16_000);
  assert.equal(host.status, 'online'); assert.equal(host.ws, socket); assert.equal(host.error, '');
});

test('connection diagnostics distinguish wrong routes, wrong services and WebSocket failure', async t => {
  for (const [status, body, expected] of [[404, '', /HTTP 404/], [200, '<html>NAS</html>', /未返回兼容/], [200, healthy, /WebSocket 连接失败/]]) {
    await t.test(String(status) + body.slice(0, 15), async t => {
      const server = createServer((req, res) => { res.writeHead(status); res.end(body); });
      server.on('upgrade', (req, socket) => socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n'));
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      t.after(() => { server.closeAllConnections(); server.close(); });
      const host = await fixture(t);
      await host.manage('configure', { enabled: true, relay: 'http://127.0.0.1:' + server.address().port });
      await until(() => host.status === 'offline'); assert.match(host.error, expected);
    });
  }
});

test('disabling during a health check prevents a stale connection', async t => {
  let respond;
  const server = createServer((req, res) => { respond = () => res.end(healthy); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const host = await fixture(t); const relay = 'http://127.0.0.1:' + server.address().port;
  await host.manage('configure', { enabled: true, relay }); await until(() => respond);
  await host.manage('configure', { enabled: false, relay }); respond(); await pause(100);
  assert.equal(host.status, 'disabled'); assert.equal(host.ws, null); assert.equal(host.attempt, null);
});
