/** One tab's independent transport, draft, model selection and streamed history. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SideRoute } from '@deepseek-ai/dsh-w1-side-chat/types'
import type {} from '@deepseek-ai/dsh-w1-side-chat/remote'

export interface SideMessage { readonly id: number; readonly role: 'user' | 'assistant'; readonly text: string }
export interface SideState {
  readonly messages: readonly SideMessage[]
  readonly draft: string
  readonly phase: 'opening' | 'idle' | 'running' | 'error' | 'stopped'
  readonly error: string | null
  readonly route: SideRoute | null
  readonly contextMessages: number
  readonly catalog: ModelCatalog | null
  readonly catalogError: string | null
  readonly closeRequested: boolean
  readonly usage: TokenUsage | null
}
/** Feed the shared picker from side-chat state without binding a main Session directory. */
export function sideModelDirectory(state: SideState): ModelDirectoryState {
  return {
    current: state.route,
    routable: state.catalog === null || state.route === null ? null : state.catalog.routableProviders.includes(state.route.provider),
    groups: state.catalog?.groups ?? [], failures: state.catalog?.failures ?? [], pending: null,
    status: state.catalogError !== null ? 'error' : state.catalog === null ? 'loading' : 'ready',
    error: state.catalogError,
  }
}
export class SideChatModel {
  readonly state = createSnapshotStore<SideState>({ messages: [], draft: '', phase: 'opening', error: null,
    route: null, contextMessages: 0, catalog: null, catalogError: null, closeRequested: false, usage: null })
  private request: AbortController | undefined
  private readonly lifetime = new AbortController()
  private readonly opening: Promise<void>
  private sequence = 0
  private closeRetry: (() => void) | undefined
  private closeApproved = false
  constructor(private readonly remote: ClientRemote, private readonly sessionId: SessionId, private readonly id: string) {
    this.opening = this.open()
  }
  private patch(update: Partial<SideState>): void {
    if (!this.lifetime.signal.aborted) this.state.set({ ...this.state.getSnapshot(), ...update })
  }
  private async open(): Promise<void> {
    try {
      for await (const opened of this.remote.w1SideChat.open(this.sessionId, this.id, this.lifetime.signal)) {
        this.patch({ ...opened, phase: 'idle' })
        await this.loadCatalog()
      }
      this.patch({ phase: 'error', route: null, error: 'Temporary side chat closed. Open a new side chat.' })
    } catch (error) { this.patch({ phase: 'error', route: null, error: error instanceof Error ? error.message : String(error) }) }
  }
  /** Reload model choices without closing the already-open side conversation. */
  readonly loadCatalog = async (): Promise<void> => {
    this.patch({ catalogError: null })
    try {
      const catalog = await this.remote.session.modelCatalog()
      if (!catalog.ok) throw catalog.error
      this.patch({ catalog: catalog.value, catalogError: null })
    } catch (error) {
      this.patch({ catalogError: error instanceof Error ? error.message : String(error) })
    }
  }
  readonly draft = (draft: string): void => { this.patch({ draft }) }
  /**
   * Retain a populated temporary chat until the user confirms the captured close operation.
   * @param retry - original sidebar operation, checked again before committing.
   * @returns true for an empty chat or the synchronous confirmed retry; false while prompting.
   */
  requestClose(retry: () => void): boolean {
    if (this.state.getSnapshot().messages.length === 0 || this.closeApproved) return true
    this.closeRetry = retry
    this.patch({ closeRequested: true })
    return false
  }
  readonly cancelClose = (): void => { this.closeRetry = undefined; this.patch({ closeRequested: false }) }
  readonly confirmClose = (): void => {
    const retry = this.closeRetry
    this.closeRetry = undefined
    this.patch({ closeRequested: false })
    this.closeApproved = true
    try { retry?.() } finally { this.closeApproved = false }
  }
  readonly model = (route: SideRoute): void => { if (this.request === undefined) this.patch({ route }) }
  readonly stop = (): void => { this.request?.abort() }
  readonly send = async (): Promise<void> => {
    const state = this.state.getSnapshot()
    if (this.request !== undefined || state.route === null || state.draft.trim() === '' || state.phase === 'opening') return
    const request = new AbortController()
    this.request = request
    const user = { id: ++this.sequence, role: 'user' as const, text: state.draft.trim() }
    let answer = { id: ++this.sequence, role: 'assistant' as const, text: '' }
    this.patch({ messages: [...state.messages, user, answer], draft: '', phase: 'running', error: null, usage: null })
    try {
      for await (const frame of this.remote.w1SideChat.send(this.sessionId, this.id, user.text, state.route,
        true, AbortSignal.any([request.signal, this.lifetime.signal]))) {
        if (request.signal.aborted || this.lifetime.signal.aborted) break
        if (frame.kind === 'text') {
          answer = { ...answer, text: answer.text + frame.text }
          this.patch({ messages: [...state.messages, user, answer] })
        }
        if (frame.kind === 'done') this.patch({ usage: frame.usage ?? null })
      }
      this.patch({ phase: request.signal.aborted ? 'stopped' : 'idle' })
    } catch (error) {
      this.patch(request.signal.aborted ? { phase: 'stopped' }
        : { phase: 'error', error: error instanceof Error ? error.message : String(error), draft: user.text })
    } finally { if (this.request === request) this.request = undefined }
  }
  async dispose(): Promise<void> {
    this.closeRetry = undefined
    this.lifetime.abort()
    this.request?.abort()
    await this.opening
    const result = await this.remote.w1SideChat.close(this.sessionId, this.id)
    if (!result.ok) throw result.error
  }
}
