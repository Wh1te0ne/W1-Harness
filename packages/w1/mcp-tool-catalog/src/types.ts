/** Durable identities selected for Native MCP declaration disclosure. */
export interface McpDisclosure {
  readonly name: string
  readonly serverName: string
  readonly rawName: string
  readonly fingerprint: string
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Exact MCP identities and schema fingerprints requested by the calling session; not an execution grant. */
    'w1/mcp-disclosure': { readonly tools: readonly McpDisclosure[] }
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { w1McpDisclosure: McpDisclosure[] }
}
