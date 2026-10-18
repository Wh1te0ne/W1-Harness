// Browser/Node shared, versioned authenticated transport. Keys never reach the relay.
const encoder = new TextEncoder();
export const DEFAULT_RELAY = 'https://w1hrelay.whiteone.cn:8112';
export function b64(bytes) { let text = ''; for (let n = 0; n < bytes.length; n += 8192) text += String.fromCharCode(...bytes.subarray(n, n + 8192)); return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export function unb64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 4_000_000) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export async function identity(token) {
  if (unb64(token).length !== 32) throw new Error('Invalid credential');
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
}
export function relayOrigin(value, development = false) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || (development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('中继地址必须是 HTTPS 域名，不能包含路径或密码');
  return url.origin;
}
export function socketUrl(origin) { return origin.replace(/^http/, 'ws') + '/v1/connect'; }
export function encodePairing(value) { return 'w1h://pair?data=' + b64(encoder.encode(JSON.stringify(value))); }
export function decodePairing(value, development = false) {
  const url = new URL(value.trim());
  if (url.protocol !== 'w1h:' || url.hostname !== 'pair') throw new Error('请扫描 W1 电脑端生成的二维码');
  const p = JSON.parse(new TextDecoder().decode(unb64(url.searchParams.get('data'))));
  if (p.v !== 1 || !Number.isFinite(p.expiresAt) || p.expiresAt < Date.now()) throw new Error('二维码已过期，请在电脑端重新生成');
  p.relay = relayOrigin(p.relay, development);
  for (const key of ['hostId', 'inviteId', 'token', 'secret']) if (unb64(p[key]).length !== 32) throw new Error('二维码数据无效');
  return p;
}
export async function secureChannel(secret, hostNonce, clientNonce, context, side) {
  for (const value of [secret, hostNonce, clientNonce]) if (unb64(value).length !== 32) throw new Error('Invalid key material');
  const material = await crypto.subtle.importKey('raw', unb64(secret), 'HKDF', false, ['deriveKey']);
  const salt = new Uint8Array([...unb64(hostNonce), ...unb64(clientNonce)]);
  const derive = direction => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt,
    info: encoder.encode(`w1h-remote-v1:${context}:${direction}`) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const [outKey, inKey] = await Promise.all([derive(side === 'host' ? 'h2m' : 'm2h'), derive(side === 'host' ? 'm2h' : 'h2m')]);
  let sent = 0, received = 0;
  const iv = seq => { const value = new Uint8Array(12); new DataView(value.buffer).setBigUint64(4, BigInt(seq)); return value; };
  return {
    async seal(payload) {
      const seq = sent++;
      const bytes = encoder.encode(JSON.stringify(payload));
      if (bytes.length > 1_400_000) throw new Error('远程消息过大');
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv(seq), additionalData: encoder.encode(context) }, outKey, bytes);
      return { seq, data: b64(new Uint8Array(data)) };
    },
    async open(frame) {
      if (!frame || !Number.isSafeInteger(frame.seq) || frame.seq !== received) throw new Error('Invalid or replayed frame');
      const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv(frame.seq), additionalData: encoder.encode(context) }, inKey, unb64(frame.data));
      const payload = JSON.parse(new TextDecoder().decode(data)); received++; return payload;
    },
  };
}
