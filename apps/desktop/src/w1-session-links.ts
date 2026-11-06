/** Queued W1 conversation navigation across cold launch, renderer readiness, and later activations. */
import { decodeSessionLink, encodeSessionLink, type SessionLinkScheme } from '@deepseek-ai/dsh-session-reference/link'

/** Own the latest explicit link until the product client acknowledges it. */
export class W1SessionLinks {
  private pending: string | null = null
  constructor(readonly scheme: SessionLinkScheme, private readonly notify: () => void) {}
  /** Accept only this environment's canonical conversation links. */
  accept(url: string): boolean {
    try { this.pending = decodeSessionLink(url, this.scheme) }
    catch { return false }
    this.notify()
    return true
  }
  /** Read the pending request without losing it across a renderer restart. */
  peek(): string | null { return this.pending }
  /** Acknowledge exactly the request that the product client has handled. */
  acknowledge(id: string): void { if (this.pending === id) this.pending = null }
  /** Create a clipboard URL for one conversation ID. */
  create(id: string): string { return encodeSessionLink(id, this.scheme) }
  /** Resolve an in-app link without dispatching a second navigation request. */
  resolve(link: string): string { return decodeSessionLink(link, this.scheme) }
}
