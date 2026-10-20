/** Automatic loopback transport for the installed extension; never launches Chrome. */
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { ChromeCommand, BrowserResult } from '@deepseek-ai/dsh-w1-browser-use/protocol'
import { browserResultSchema } from '@deepseek-ai/dsh-w1-browser-use/protocol'
import { EXTENSION_ORIGIN, BRIDGE_PORTS } from './identity.ts'
import { clientMessageSchema, webOrigin, type SharedTab } from './protocol.ts'

/**
 * Desktop-owned extension identity, transport limits and connection lifecycle inputs.
 */
export interface ChromeBridgeOptions { readonly port: number; readonly connectWaitMs: number; readonly timeoutMs: number }
interface Pending {
  readonly session: string
  readonly finish: (error: Error | undefined, result?: BrowserResult) => void
  readonly cancel: () => void
}
interface Connection {
  readonly id: string
  readonly socket: WebSocket
  tabs: SharedTab[]
  readonly owners: Map<number, string>
  readonly pending: Map<string, Pending>
  readonly busy: Set<string>
  lastSeen: number
}

/** A connected Chrome profile is discoverable; operations lease individual tabs to their caller. */
export class ChromeBridge {
  private server: Server | undefined
  private sockets: WebSocketServer | undefined
  private starting: Promise<number> | undefined
  private connection: Connection | undefined
  private readonly waiters = new Set<() => void>()
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private disposed = false

  constructor(private readonly options: ChromeBridgeOptions) {
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error('Invalid Chrome bridge port')
    for (const value of [options.connectWaitMs, options.timeoutMs]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('Chrome bridge deadlines must be positive integers')
    }
  }

  /**
   * Listen without touching the browser. The enabled extension connects itself.
   * @returns The selected listening port after the loopback bridge is ready.
   */
  start(): Promise<number> {
    if (this.disposed) return Promise.reject(new Error('Chrome bridge disposed'))
    return this.starting ??= new Promise<number>((resolve, reject) => {
      const server = createServer((request, response) => {
        const address = server.address()
        const host = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : ''
        if (!this.disposed && request.method === 'GET' && request.url === '/w1-chrome/health'
          && request.headers.host === host && request.socket.remoteAddress === '127.0.0.1'
          && (request.headers.origin === undefined || request.headers.origin === EXTENSION_ORIGIN)) {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': EXTENSION_ORIGIN })
          response.end(JSON.stringify({ application: 'w1-chrome', version: 2 }))
          return
        }
        response.writeHead(404); response.end()
      })
      this.server = server
      const sockets = new WebSocketServer({ noServer: true, maxPayload: 9_000_000, perMessageDeflate: false })
      this.sockets = sockets
      server.on('upgrade', (request, socket, head) => {
        const address = server.address()
        const host = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : ''
        if (this.disposed || request.headers.origin !== EXTENSION_ORIGIN || request.headers.host !== host
          || request.url !== '/w1-chrome' || request.socket.remoteAddress !== '127.0.0.1' || sockets.clients.size >= 8) {
          socket.destroy(); return
        }
        sockets.handleUpgrade(request, socket, head, (ws) => { this.accept(ws) })
      })
      const ports: readonly number[] = this.options.port === BRIDGE_PORTS[0] ? BRIDGE_PORTS : [this.options.port]
      let candidate = 0
      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && candidate + 1 < ports.length && !this.disposed) {
          candidate++; server.listen(ports[candidate], '127.0.0.1'); return
        }
        this.starting = undefined; reject(error)
      })
      server.once('listening', () => {
        if (this.disposed) { server.close(); reject(new Error('Chrome bridge disposed')); return }
        const address = server.address()
        if (!address || typeof address === 'string') { reject(new Error('Chrome bridge has no TCP address')); return }
        this.heartbeat = setInterval(() => {
          const connection = this.connection
          if (!connection) return
          if (Date.now() - connection.lastSeen > 45000) this.drop(connection)
          else connection.socket.send(JSON.stringify({ type: 'ping' }))
        }, 20000)
        this.heartbeat.unref()
        resolve(address.port)
      })
      server.listen(ports[candidate], '127.0.0.1')
    })
  }

  /** The actual Agent session owns each call; model arguments cannot select another owner. */
  readonly request = async (session: string, command: ChromeCommand, signal: AbortSignal): Promise<BrowserResult> => {
    signal.throwIfAborted()
    if (this.disposed) throw new Error('Chrome bridge disposed')
    if (!session || session.length > 256) throw new Error('Invalid Chrome conversation')
    await this.start()
    signal.throwIfAborted()
    if (command.action === 'connect' && !this.connection) await this.waitForConnection(signal)
    const connection = this.connection
    if (command.action === 'disconnect') {
      if (connection) {
        for (const pending of connection.pending.values()) if (pending.session === session) pending.cancel()
        for (const [tab, owner] of connection.owners) if (owner === session) connection.owners.delete(tab)
        connection.socket.send(JSON.stringify({ type: 'release', session }))
      }
      return { text: 'Released this conversation’s Chrome tabs. Other conversations and the extension connection are unaffected.' }
    }
    if (command.action === 'list' || command.action === 'connect') {
      const query = command.action === 'list' && 'query' in command ? command.query?.toLowerCase() ?? '' : ''
      const tabs = connection?.tabs.filter(tab => `${tab.title}\n${tab.url}`.toLowerCase().includes(query)) ?? []
      const visible = connection ? tabs.slice(0, 50).map(tab => ({
        tab: `chrome:${connection.id}:${tab.id}`, url: tab.url.slice(0, 1000), title: tab.title, enabled: tab.enabled,
        available: !connection.owners.has(tab.id) || connection.owners.get(tab.id) === session,
      })) : []
      return { text: JSON.stringify({ connected: connection !== undefined, total: tabs.length, truncated: tabs.length > 50,
        tabs: visible,
        ...connection ? {} : { message: 'Chrome extension is not connected. Install or enable W1 Chrome and keep Chrome running; it connects automatically. No connection code or tab sharing is needed.' } }) }
    }
    if (!connection) throw new Error('Chrome extension is not connected. It connects automatically when enabled; do not substitute another browser.')
    if (connection.pending.size >= 16) throw new Error('Too many Chrome operations are pending; wait for them to settle.')
    let target = 'open'
    if (command.action === 'open') webOrigin(command.url)
    else {
      const tab = connection.tabs.find(tab => `chrome:${connection.id}:${tab.id}` === command.tab)
      if (!tab) throw new Error('Chrome tab unavailable: its handle expired after reconnect or the tab closed. No input was sent. Call list, match the intended URL/title, then read to obtain fresh refs before acting.')
      if (!tab.enabled) throw new Error('Chrome tab is paused. Only the user can resume it in the extension.')
      const owner = connection.owners.get(tab.id)
      if (owner && owner !== session) throw new Error('Chrome tab is controlled by another conversation. Select another tab or open a new one.')
      target = String(tab.id)
      if (command.action === 'navigate') webOrigin(command.url)
      connection.owners.set(tab.id, session)
    }
    if (connection.busy.has(target)) throw new Error('Chrome tab has an unfinished operation. Inspect after it settles; do not retry input.')
    connection.busy.add(target)
    const id = randomUUID()
    return new Promise<BrowserResult>((resolve, reject) => {
      let settled = false
      let grace: ReturnType<typeof setTimeout> | undefined
      const finish = (error: Error | undefined, result?: BrowserResult): void => {
        clearTimeout(timer)
        if (grace) clearTimeout(grace)
        signal.removeEventListener('abort', cancel)
        connection.pending.delete(id)
        connection.busy.delete(target)
        if (settled) return
        settled = true
        if (error) reject(error)
        else if (result) resolve(result)
        else reject(new Error('Missing Chrome result'))
      }
      const cancel = (): void => {
        if (settled) return
        settled = true
        reject(new Error('Chrome action cancelled or timed out; input may have happened. Inspect before retrying.'))
        if (connection.socket.readyState === WebSocket.OPEN) connection.socket.send(JSON.stringify({ type: 'cancel', id }))
        grace = setTimeout(() => { this.drop(connection) }, this.options.timeoutMs)
        grace.unref()
      }
      const timer = setTimeout(cancel, this.options.timeoutMs)
      timer.unref()
      connection.pending.set(id, { session, finish, cancel })
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) { cancel(); return }
      connection.socket.send(JSON.stringify({ type: 'command', id, session,
        command: command.action === 'open' ? command : { ...command, tab: target } }), (error) => {
        if (error) finish(new Error('Chrome transport failed; inspect before retrying.'))
      })
    })
  }

  private waitForConnection(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (): void => { clearTimeout(timer); this.waiters.delete(done); signal.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, this.options.connectWaitMs)
      this.waiters.add(done)
      signal.addEventListener('abort', done, { once: true })
      if (signal.aborted) done()
    }).then(() => { signal.throwIfAborted(); if (this.disposed) throw new Error('Chrome bridge disposed') })
  }

  private accept(socket: WebSocket): void {
    let connection: Connection | undefined
    const handshake = setTimeout(() => { if (!connection) socket.terminate() }, 5000)
    handshake.unref()
    socket.on('error', () => { socket.terminate() })
    socket.on('close', () => { clearTimeout(handshake); if (connection) this.drop(connection) })
    socket.on('message', (bytes, binary) => {
      try {
        const buffer = Array.isArray(bytes) ? Buffer.concat(bytes) : Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
        if (binary || (!connection && buffer.length > 2_000_000)) throw new Error('Invalid Chrome handshake')
        const message = clientMessageSchema.parse(JSON.parse(buffer.toString('utf8')))
        if (!connection) {
          if (message.type !== 'hello' || this.connection) throw new Error('Chrome profile already connected or incompatible extension')
          for (const tab of message.tabs) webOrigin(tab.url)
          if (new Set(message.tabs.map(tab => tab.id)).size !== message.tabs.length) throw new Error('Duplicate Chrome tab')
          connection = { id: randomUUID(), socket, tabs: message.tabs, owners: new Map(),
            pending: new Map(), busy: new Set(), lastSeen: Date.now() }
          this.connection = connection
          clearTimeout(handshake)
          socket.send(JSON.stringify({ type: 'ready', version: 2 }))
          for (const done of [...this.waiters]) done()
          return
        }
        connection.lastSeen = Date.now()
        if (message.type === 'state') {
          for (const tab of message.tabs) webOrigin(tab.url)
          if (new Set(message.tabs.map(tab => tab.id)).size !== message.tabs.length) throw new Error('Duplicate Chrome tab')
          connection.tabs = message.tabs
          const present = new Set(message.tabs.map(tab => tab.id))
          for (const id of connection.owners.keys()) if (!present.has(id)) connection.owners.delete(id)
          for (const tab of message.tabs) if (!connection.busy.has(String(tab.id))) {
            if (tab.owner) connection.owners.set(tab.id, tab.owner)
            else connection.owners.delete(tab.id)
          }
        } else if (message.type === 'result') {
          const pending = connection.pending.get(message.id)
          if (pending) {
            const result = message.result ? browserResultSchema.parse(message.result) : undefined
            if (result) {
              const observation: unknown = JSON.parse(result.text)
              if (typeof observation === 'object' && observation !== null && 'tab' in observation
                && (typeof observation.tab === 'number' || typeof observation.tab === 'string')) {
                observation.tab = `chrome:${connection.id}:${observation.tab}`
                result.text = JSON.stringify(observation)
              }
            }
            pending.finish(message.error ? new Error(message.error) : undefined, result)
          }
        } else if (message.type !== 'pong') throw new Error('Unexpected Chrome message')
      } catch { socket.terminate() }
    })
  }

  private drop(connection: Connection): void {
    if (this.connection === connection) this.connection = undefined
    for (const pending of [...connection.pending.values()]) pending.finish(new Error('Chrome disconnected; outcome may be unknown. Reconnect and inspect.'))
    connection.socket.terminate()
  }

  /**
   * Release owned listeners and transports and cancel pending operations.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    for (const done of [...this.waiters]) done()
    if (this.connection) this.drop(this.connection)
    for (const socket of this.sockets?.clients ?? []) socket.terminate()
    this.sockets?.close()
    if (this.server?.listening) await new Promise<void>((resolve) => { this.server?.close(() => { resolve() }) })
  }
}
