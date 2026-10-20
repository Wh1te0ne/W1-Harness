/** Content-free cache observations. Provider cache keys and TTL are never inferred. */
export interface CacheDiagnostic {
  readonly turn: number
  readonly step: number
  readonly provider: string
  readonly model: string
  readonly channel: 'normalized' | 'deepseek-wire'
  readonly status: 'cold' | 'stable' | 'expected-rebuild' | 'suspected-miss' | 'unknown'
  readonly causes: readonly ('route' | 'system' | 'tools' | 'settings' | 'messages' | 'comparison-limit')[]
  readonly inputTokens?: number | undefined
  readonly cacheReadTokens?: number | undefined
  readonly cacheWriteTokens?: number | undefined
  readonly observedInputTokens?: number | undefined
  readonly messageCount: number
  readonly requestBytes: number
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** A bounded content-free observation of one main-loop request; missing cache counters remain unknown. */
    'w1/cache-diagnostic': CacheDiagnostic
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    w1CacheDiagnostics: CacheDiagnostic[]
    w1CachePosition: { readonly turn: number; readonly step: number }
  }
  interface SessionProjectionMap { w1CacheDiagnostics: CacheDiagnostic[] }
}
