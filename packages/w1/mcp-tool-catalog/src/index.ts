/** Native MCP schemas enter model requests only after bounded catalog selection. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { McpDisclosure } from './types.ts'
export type {} from './types.ts'

export const name = 'w1-mcp-tool-catalog'
export const inject = ['tools', 'agents', 'systemPrompt', 'sessionProjections']
/** Bounds for search responses and the session's disclosed MCP schemas. */
export interface Config {
  /** Enable Native declaration filtering and the catalog tool. */
  readonly enabled: boolean
  /** Maximum search entries per page. */
  readonly maxResults: number
  /** Maximum UTF-8 bytes in a complete canonical search or load response. */
  readonly maxResponseBytes: number
  /** Maximum simultaneously disclosed MCP tools per session. */
  readonly maxLoadedTools: number
  /** Maximum UTF-8 bytes of the complete disclosed MCP schema array. */
  readonly maxLoadedBytes: number
}
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  maxResults: z.number().step(1).min(1).required(),
  maxResponseBytes: z.number().step(1).min(256).required(),
  maxLoadedTools: z.number().step(1).min(1).required(),
  maxLoadedBytes: z.number().step(1).min(1).required(),
})
const catalogName = 'w1_tool_catalog'
const identitySchema = schema.object({
  name: schema.string(), serverName: schema.string(), rawName: schema.string(), fingerprint: schema.string(),
})

/**
 * Register durable selection and filter scoped Native prompt assemblies.
 * @param ctx - tool registry and prompt assembly owner.
 * @param config - validated disclosure policy.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.sessionProjections.register({ key: 'w1McpDisclosure', stateVersion: 1, stateSchema: schema.array(identitySchema), init: () => [],
    apply(state, event) {
      if (event.type !== 'w1/mcp-disclosure') return state
      const selected = new Map(state.map(tool => [tool.name, tool]))
      for (const tool of event.data.tools) selected.set(tool.name, tool)
      return [...selected.values()]
    },
  })
  if (!config.enabled) return
  const unsettled = new Map<Session, Set<string>>()
  ctx.on('session/disposed', (session) => { unsettled.delete(session) })
  const directory = (agent: Agent, schemas = ctx.tools.schemas(agent)): (McpDisclosure & { schema: ToolSchema })[] => {
    return schemas.flatMap((tool) => {
      const origin = ctx.tools.get(tool.name, agent)?.origin
      if (origin?.kind !== 'mcp') return []
      return [{ name: tool.name, serverName: origin.serverName, rawName: origin.rawName, schema: tool,
        fingerprint: createHash('sha256').update(JSON.stringify({ origin, schema: tool })).digest('hex') }]
    })
  }
  const selected = (agent: Agent) => new Map((ctx.sessionProjections.stateOf(agent.session, 'w1McpDisclosure') ?? [])
    .filter(tool => !unsettled.get(agent.session)?.has(tool.fingerprint)).map(tool => [tool.name, tool.fingerprint]))
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next()
    if (assembly.tools.some(tool => tool.name === 'run_code') || !assembly.tools.some(tool => tool.name === catalogName)) return assembly
    const agent = ctx.agents.list().find(agent => agent === context.scope)
    if (agent === undefined) return assembly
    const chosen = selected(agent)
    const deferred = new Map(directory(agent, assembly.tools).map(tool => [tool.name, tool]))
    return { ...assembly, tools: assembly.tools.filter((tool) => {
      const entry = deferred.get(tool.name)
      return entry === undefined || chosen.get(tool.name) === entry.fingerprint
    }) }
  }, { global: true })
  ctx.tools.register(defineTool({
    name: catalogName,
    description: 'Find available MCP operations by names or descriptions. Search returns names and summaries. Load selected names to make their full calling schemas available on your next step. Existing execution permissions still apply.',
    parameters: {
      action: { type: 'string', required: true, enum: ['search', 'load'] },
      query: { type: 'string', description: 'Search words; empty lists available operations.' },
      offset: { type: 'integer', description: 'Non-negative search offset from the previous page.' },
      names: { type: 'array', items: { type: 'string' }, description: 'Exact public operation names returned by search, for action load.' },
    },
    output: { schema: { oneOf: [
      { type: 'object', additionalProperties: false, properties: {
        tools: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
          name: { type: 'string', required: true }, serverName: { type: 'string', required: true },
          rawName: { type: 'string', required: true }, description: { type: 'string', required: true },
        } } },
        total: { type: 'integer', required: true },
        nextOffset: { oneOf: [{ type: 'integer' }, { type: 'null' }], required: true },
      } },
      { type: 'object', additionalProperties: false, properties: { loaded: { type: 'array', required: true, items: { type: 'string' } }, availableOn: { type: 'string', required: true } } },
    ] }, render: (_args, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined || ctx.agents.get(agent.id) !== agent) throw new HarnessError('A live calling agent is required.', 'MCP_CATALOG_AGENT_REQUIRED')
      const entries = directory(agent)
      if (args.action === 'search') {
        const words = (args.query ?? '').toLocaleLowerCase().split(/\s+/u).filter(Boolean)
        const matching = entries.filter(entry => words.every(word => `${entry.name} ${entry.serverName} ${entry.rawName} ${entry.schema.description}`.toLocaleLowerCase().includes(word)))
        const offset = args.offset ?? 0
        if (!Number.isSafeInteger(offset) || offset < 0) throw new HarnessError('offset must be a non-negative integer.', 'MCP_CATALOG_OFFSET')
        const tools: { name: string; serverName: string; rawName: string; description: string }[] = []
        const result = () => ({ tools, total: matching.length,
          nextOffset: offset + tools.length < matching.length ? offset + tools.length : null })
        for (const entry of matching.slice(offset, offset + config.maxResults)) {
          tools.push({ name: entry.name, serverName: entry.serverName, rawName: entry.rawName,
            description: entry.schema.description.slice(0, 300) })
          if (Buffer.byteLength(JSON.stringify(result()), 'utf8') > config.maxResponseBytes) { tools.pop(); break }
        }
        if (matching.length > offset && tools.length === 0) throw new HarnessError('One catalog entry exceeds the response byte limit.', 'MCP_CATALOG_RESPONSE_LIMIT')
        return result()
      }
      const names = [...new Set(args.names ?? [])]
      if (names.length === 0 || names.length > config.maxLoadedTools) throw new HarnessError('Select a bounded non-empty names list from search.', 'MCP_CATALOG_SELECTION')
      const requested = names.map((name) => {
        const entry = entries.find(entry => entry.name === name)
        if (entry === undefined) throw new HarnessError(`Operation unavailable in this scope: ${name}`, 'MCP_CATALOG_UNAVAILABLE')
        return entry
      })
      const chosen = selected(agent)
      for (const entry of requested) chosen.set(entry.name, entry.fingerprint)
      const schemas = entries.filter(entry => chosen.get(entry.name) === entry.fingerprint).map(entry => entry.schema)
      if (schemas.length > config.maxLoadedTools || Buffer.byteLength(JSON.stringify(schemas), 'utf8') > config.maxLoadedBytes) {
        throw new HarnessError('Selected declarations exceed the session disclosure limit. Start a narrower session or increase the configured limit.', 'MCP_CATALOG_DISCLOSURE_LIMIT')
      }
      const result = { loaded: names, availableOn: 'next-step' }
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > config.maxResponseBytes) throw new HarnessError('Selection acknowledgement exceeds the response byte limit.', 'MCP_CATALOG_RESPONSE_LIMIT')
      const tools = requested.map(({ schema: _schema, ...identity }) => identity)
      const pending = unsettled.get(agent.session) ?? new Set<string>()
      unsettled.set(agent.session, pending)
      for (const tool of tools) pending.add(tool.fingerprint)
      agent.session.append('w1/mcp-disclosure', { tools })
      await ctx.get('sessionPersistence')?.flush()
      exec.signal.throwIfAborted()
      for (const tool of tools) pending.delete(tool.fingerprint)
      return result
    },
  }))
}
