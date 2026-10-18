/** Native notification and taskbar delivery owned by the W1 desktop shell. */
import { Notification, nativeImage, type BrowserWindow } from 'electron'
import type { DesktopNotificationResult, DesktopNotificationRequest, DesktopAttentionRequest } from './ipc.ts'

interface NoticeEntry { notice: Notification; settle(result: DesktopNotificationResult): void }

/** Keeps native notifications alive and routes clicks to the owning product window. */
export class W1Notifications {
  private readonly notices = new Map<string, NoticeEntry>()
  private window: BrowserWindow | undefined
  private readonly stopFlash = (): void => { if (this.window !== undefined && !this.window.isDestroyed()) this.window.flashFrame(false) }
  constructor(private readonly getWindow: () => BrowserWindow | undefined, private readonly productName: string) {}

  /** Post one bounded notification, replacing the same conversation's previous notice. */
  show(value: unknown): Promise<DesktopNotificationResult> {
    if (value === null || typeof value !== 'object') throw new Error('Invalid notification')
    const request = value as Partial<DesktopNotificationRequest>
    if (typeof request.id !== 'string' || request.id.length === 0 || request.id.length > 200
      || typeof request.title !== 'string' || request.title.length > 120
      || typeof request.body !== 'string' || request.body.length > 500) throw new Error('Invalid notification fields')
    if (!Notification.isSupported()) return Promise.resolve({ status: 'unsupported' })
    const { id, title, body } = request
    this.close(id)
    return new Promise((resolve) => {
      let settled = false
      const settle = (result: DesktopNotificationResult): void => { if (!settled) { settled = true; clearTimeout(timer); resolve(result) } }
      const timer = setTimeout(() => { settle({ status: 'unconfirmed' }) }, 5_000)
      try {
        const notice = new Notification({ title: `${this.productName} · ${title}`, body, silent: true })
        const entry = { notice, settle }
        this.notices.set(id, entry)
        notice.once('show', () => { settle({ status: 'shown' }) })
        notice.once('failed', (_event, error) => {
          settle({ status: 'failed', message: String(error).slice(0, 300) })
          if (this.notices.get(id) === entry) this.notices.delete(id)
        })
        notice.once('click', () => {
          this.focus()
          const window = this.getWindow()
          if (window !== undefined && !window.isDestroyed()) window.webContents.send('w1-desktop:notification-click', id)
          this.close(id)
        })
        notice.once('close', () => {
          settle({ status: 'cancelled' })
          if (this.notices.get(id) === entry) this.notices.delete(id)
        })
        notice.show()
      } catch (error) {
        settle({ status: 'failed', message: error instanceof Error ? error.message.slice(0, 300) : 'Native notification failed' })
        this.notices.delete(id)
      }
    })
  }

  /** Withdraw one conversation's notification; unrelated notices remain active. */
  close(id: unknown): void {
    if (typeof id !== 'string' || id.length > 200) throw new Error('Invalid notification id')
    const entry = this.notices.get(id)
    if (entry === undefined) return
    this.notices.delete(id)
    entry.settle({ status: 'cancelled' })
    entry.notice.removeAllListeners()
    entry.notice.close()
  }

  /** Set Windows attention without stealing focus unless the user clicked a notice. */
  sync(value: unknown): { supported: boolean } {
    if (value === null || typeof value !== 'object') throw new Error('Invalid attention request')
    const request = value as Partial<DesktopAttentionRequest>
    if (!Number.isInteger(request.count) || request.count === undefined || request.count < 0 || request.count > 9999
      || typeof request.flash !== 'boolean' || typeof request.focus !== 'boolean' || typeof request.probe !== 'boolean'
      || (request.badge !== null && (typeof request.badge !== 'string' || request.badge.length > 16000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(request.badge)))) throw new Error('Invalid attention fields')
    const window = this.getWindow()
    if (window === undefined || window.isDestroyed() || process.platform !== 'win32') return { supported: false }
    if (this.window !== window) {
      this.window?.removeListener('focus', this.stopFlash)
      this.window = window
      window.on('focus', this.stopFlash)
    }
    if (request.focus) this.focus()
    if (!request.probe) {
      const badge = request.count > 0 && request.badge !== null ? nativeImage.createFromDataURL(request.badge) : null
      if (badge !== null && (badge.isEmpty() || badge.getSize().width > 64 || badge.getSize().height > 64)) throw new Error('Invalid badge image')
      window.setOverlayIcon(badge, request.count > 0 ? `${request.count}` : '')
      window.flashFrame(request.flash && !window.isFocused())
    }
    return { supported: true }
  }

  private focus(): void {
    const window = this.getWindow()
    if (window === undefined || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  /** Release notices and attention when the product exits or its renderer reloads. */
  dispose(): void {
    for (const id of this.notices.keys()) this.close(id)
    if (this.window !== undefined && !this.window.isDestroyed()) {
      this.window.removeListener('focus', this.stopFlash)
      this.window.flashFrame(false)
      if (process.platform === 'win32') this.window.setOverlayIcon(null, '')
    }
    this.window = undefined
  }
}
