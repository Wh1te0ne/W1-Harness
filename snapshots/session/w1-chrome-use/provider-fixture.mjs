/** Synthetic transport only; the shipped W1 tool and result pipeline remain real. */
import * as provider from '@deepseek-ai/dsh-w1-browser-use'
import * as policy from '@deepseek-ai/dsh-w1-tool-selection'
export const name = 'w1-browser-fixture'
export const inject = ['browserUse', 'tools', 'systemPrompt', 'agents']
export async function apply(ctx) {
  await ctx.plugin(policy)
  // This scenario has no filesystem actions. A stable fixture context avoids embedding
  // Windows temporary-directory escaping in the browser tool's portable recording.
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.systemPrompt.context({ name: 'working-directory:current', order: 0, required: true,
      text: 'This synthetic browser scenario performs no filesystem actions.', interpolate: false })
  })
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembly = await next()
    const directory = assembly.contexts.find(entry => entry.name === 'working-directory:current')
    if (directory !== undefined) directory.text = 'This synthetic browser scenario performs no filesystem actions.'
    return assembly
  }, { prepend: true })
  await ctx.plugin(provider, { timeoutMs: 1000, maxTextChars: 1000, maxElements: 10,
    async request() { throw new Error("Built-in browser was not selected") },
    async chromeRequest(sessionId, command) {
      if (!sessionId || command.action !== 'list') throw new Error('Unexpected browser fixture request')
      return { text: JSON.stringify({ connected: true, total: 1, truncated: false, tabs: [{ tab: "fixture-tab", url: "https://fixture.test/", title: "Fixture", enabled: true, available: true }] }) }
    },
  })
}
