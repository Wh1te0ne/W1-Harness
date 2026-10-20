/** Automatic MV3 connection. Only enabled/port preferences persist, never in-flight actions or leases. */
import { z } from 'zod'
import { ChromeController } from './controller.ts'
import type { ChromeApi } from './extension-api.ts'
import { serverMessageSchema } from './protocol.ts'
import { BRIDGE_PORTS } from './identity.ts'

/**
 * A stopped desktop is a normal waiting state; never create a WebSocket before readiness.
 * @param port - Configured loopback port.
 * @param signal - Aborted when access is paused, the port changes or the worker is disposed.
 * @returns whether the expected W1 bridge is ready for protocol 2.
 */
export async function bridgeReady(port: number, signal: AbortSignal): Promise<boolean | 'outdated'> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/w1-chrome/health`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]), cache: 'no-store', credentials: 'omit', redirect: 'error',
    })
    if (!response.ok) return 'outdated'
    const value: unknown = await response.json()
    return typeof value === 'object' && value !== null && 'application' in value && value.application === 'w1-chrome'
      && 'version' in value && value.version === 2 ? true : 'outdated'
  } catch (_error) {
    // Connection refusal, timeout and cancellation are expected while the desktop is unavailable.
    return false
  }
}

export const popupMessageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('enable'), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('reconnect') }).strict(),
  z.object({ action: z.literal('pause'), id: z.number().int().nonnegative(), paused: z.boolean() }).strict(),
])

/** One extension installation connects automatically to the local W1 Host. */
export class ExtensionConnection {
  readonly controller: ChromeController
  private socket: WebSocket | undefined
  private paired = false
  private enabled = false
  private port = 17832
  private readonly tasks = new Map<string, { controller: AbortController; session: string }>()
  private generation = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private retryDelay = 1000
  private connecting: Promise<void> | undefined
  private initialization: Promise<void> | undefined
  private closed = false
  private probe: AbortController | undefined
  private status: 'waiting' | 'update' = 'waiting'

  constructor(private readonly api: ChromeApi, private readonly createSocket: (url: string) => WebSocket = url => new WebSocket(url),
    private readonly ready: (port: number, signal: AbortSignal) => Promise<boolean | 'outdated'> = bridgeReady,
    private readonly ports: readonly number[] = BRIDGE_PORTS) {
    this.controller = new ChromeController(api, () => { this.publish() })
  }

  /** Installation permission enables ordinary-tab discovery; a saved pause survives worker restarts. */
  initialize(): Promise<void> {
    return this.initialization ??= (async () => {
      const saved = await this.api.storage.local.get(['enabled'])
      if (this.closed) return
      this.enabled = saved.enabled !== false
      await this.api.alarms.create('w1-reconnect', { periodInMinutes: 1 })
      if (this.enabled) void this.reconnect()
    })()
  }

  async popup(input: unknown): Promise<object> {
    await this.initialize()
    const message = popupMessageSchema.parse(input)
    switch (message.action) {
      case 'enable':
        this.enabled = message.enabled
        this.disconnect()
        await this.api.storage.local.set({ enabled: this.enabled })
        if (this.enabled) void this.reconnect()
        break
      case 'reconnect': if (this.enabled) { this.disconnect(); void this.reconnect() } break
      case 'pause': this.controller.pause(message.id, message.paused); break
      case 'status': break
    }
    const tabs = this.controller.list()
    return { connected: this.paired, enabled: this.enabled, port: this.port, status: this.status,
      total: tabs.length, controlled: tabs.filter(tab => tab.owner).length,
      tabs: tabs.slice(0, 50).map(({ owner: _owner, ...tab }) => tab) }
  }

  /** Called by startup, alarm or retry; never replays browser operations. */
  reconnect(): Promise<void> {
    if (this.closed || !this.enabled || this.paired) return Promise.resolve()
    if (this.retry) { clearTimeout(this.retry); this.retry = undefined }
    if (this.connecting) return this.connecting
    const generation = this.generation
    const attempt = this.connect(generation).catch(() => {}).finally(() => {
      if (this.connecting === attempt) this.connecting = undefined
      if (!this.closed && this.enabled && !this.paired) this.scheduleRetry()
    })
    this.connecting = attempt
    return attempt
  }

  private async connect(generation: number): Promise<void> {
    const probe = new AbortController()
    this.probe = probe
    let available: number | undefined
    let outdated = false
    for (const port of this.ports) {
      if (!this.canConnect(generation)) break
      const result = await this.ready(port, probe.signal)
      if (result === true) { available = port; break }
      if (result === 'outdated') outdated = true
    }
    if (this.probe === probe) this.probe = undefined
    if (!this.canConnect(generation)) return
    this.status = outdated ? 'update' : 'waiting'
    if (available === undefined) return
    this.port = available
    this.status = 'waiting'
    await this.controller.start()
    if (!this.canConnect(generation)) return
    const socket = this.createSocket(`ws://127.0.0.1:${this.port}/w1-chrome`)
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('W1 unavailable')) }, 7000)
      socket.onopen = () => {
        if (this.socket !== socket) { socket.close(); return }
        socket.send(JSON.stringify({ type: 'hello', version: 2, tabs: this.controller.list() }))
      }
      socket.onclose = () => {
        clearTimeout(timer)
        if (this.socket === socket) { this.disconnect(); this.scheduleRetry() }
        reject(new Error('W1 disconnected'))
      }
      socket.onerror = () => { socket.close() }
      socket.onmessage = (event) => {
        if (this.socket !== socket) return
        try {
          if (typeof event.data !== 'string' || event.data.length > 100000) throw new Error('Invalid bridge message')
          const message = serverMessageSchema.parse(JSON.parse(event.data))
          if (message.type === 'ready') {
            if (this.paired) throw new Error('Unexpected ready response')
            clearTimeout(timer)
            this.paired = true
            this.retryDelay = 1000
            this.publish()
            resolve()
          } else if (!this.paired) throw new Error('Connection is incomplete')
          else if (message.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }))
            void this.controller.refresh().catch(() => {})
          } else if (message.type === 'cancel') this.tasks.get(message.id)?.controller.abort()
          else if (message.type === 'release') {
            for (const task of this.tasks.values()) if (task.session === message.session) task.controller.abort()
            this.controller.release(message.session)
          } else {
            if (this.tasks.has(message.id) || this.tasks.size >= 16) throw new Error('Duplicate or excessive Chrome request')
            const controller = new AbortController()
            this.tasks.set(message.id, { controller, session: message.session })
            void this.controller.execute(message.command, controller.signal, message.session).then((result) => {
              if (controller.signal.aborted) throw new Error('Chrome action cancelled; inspect before retrying')
              if (this.socket === socket) socket.send(JSON.stringify({ type: 'result', id: message.id, result }))
            }).catch((error: unknown) => {
              if (this.socket === socket && socket.readyState === 1) socket.send(JSON.stringify({ type: 'result', id: message.id,
                error: (error instanceof Error ? error.message : 'Chrome operation failed').slice(0, 1000) }))
            }).finally(() => { if (this.tasks.get(message.id)?.controller === controller) this.tasks.delete(message.id) })
          }
        } catch { this.disconnect(); this.scheduleRetry(); reject(new Error('Incompatible W1 bridge')) }
      }
    })
  }

  private canConnect(generation: number): boolean {
    return generation === this.generation && this.enabled && !this.closed
  }

  private publish(): void {
    if (this.paired && this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: 'state', tabs: this.controller.list() }))
  }

  private scheduleRetry(): void {
    if (this.closed || !this.enabled || this.paired || this.retry) return
    this.retry = setTimeout(() => { this.retry = undefined; void this.reconnect() }, this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, 30000)
  }

  private disconnect(): void {
    this.generation++
    this.probe?.abort()
    this.probe = undefined
    if (this.retry) { clearTimeout(this.retry); this.retry = undefined }
    const socket = this.socket
    this.socket = undefined
    this.paired = false
    for (const task of this.tasks.values()) task.controller.abort()
    this.tasks.clear()
    this.controller.reset()
    socket?.close()
  }

  /** Release resources on test/worker disposal without changing the saved user preference. */
  dispose(): void { this.closed = true; this.disconnect() }
}
