/** Stable model context for relative file operations; the real workspace and reviewer cwd remain unchanged. */
export const name = 'auto-review-runtime-context-fixture'
export const inject = ['systemPrompt', 'agents']

/**
 * Keep platform-specific temporary-directory escaping out of the recorded context.
 * @param ctx - scenario plugin context.
 */
export function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.systemPrompt.context({
      name: 'working-directory:current', order: 0, required: true,
      text: 'Current working directory: the scenario workspace.', interpolate: false,
    })
  })
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembly = await next()
    const directory = assembly.contexts.find(entry => entry.name === 'working-directory:current')
    if (directory === undefined) throw new Error('Auto-review scenario requires working-directory context')
    directory.text = 'Current working directory: the scenario workspace.'
    return assembly
  }, { prepend: true })
}
