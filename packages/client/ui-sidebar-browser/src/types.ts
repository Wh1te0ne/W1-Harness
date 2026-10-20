/** Type-only Electron bridge declarations shared by the desktop shell and browser provider. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Main-issued identity of one guest reservation. */
export type DesktopBrowserLeaseId = Branded<'DesktopBrowserLeaseId'>

/** Conversation ownership supplied by the trusted product client. */
export interface DesktopBrowserBinding { readonly sessionId: string; readonly requestId?: string; readonly automationEnabled?: boolean }
/** Host-requested visible tab; requestId correlates readiness without guessing an active tab. */
export interface DesktopBrowserCreateRequest extends DesktopBrowserBinding { readonly requestId: string; readonly url: string }

/** A guest's approved, process-local storage partition. */
export interface DesktopBrowserReservation {
  readonly lease: DesktopBrowserLeaseId
  readonly partition: string
}

/** Main-approved request to open an HTTP(S) page from an existing guest. */
export interface DesktopBrowserOpenRequest {
  readonly lease: DesktopBrowserLeaseId
  readonly url: string
}

/** Origin-scoped operations; no Electron objects or arbitrary IPC cross this interface. */
export interface DesktopBrowserBridge {
  /** @param workspace - resolved storage account. @returns one approved guest reservation. */
  acquire(workspace: string, binding?: DesktopBrowserBinding): Promise<DesktopBrowserReservation>
  /** Optional on older shells. Pause or resume a caller-owned tab. */
  setAutomation?(lease: DesktopBrowserLeaseId, enabled: boolean): Promise<void>
  /** Optional on older shells. Subscribe to Host requests to create a tab in a specific conversation. */
  onCreateRequested?(this: void, listener: (request: DesktopBrowserCreateRequest) => void): () => void
  /** @param lease - the caller's reservation. @returns after its guest has been destroyed. */
  release(lease: DesktopBrowserLeaseId): Promise<void>
  /** @param lease - originating guest. @param listener - approved URL consumer. @returns unsubscribe callback. */
  onOpenRequested(lease: DesktopBrowserLeaseId, listener: (url: string) => void): () => void
}
