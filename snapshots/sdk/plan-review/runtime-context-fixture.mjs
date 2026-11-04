/** Stable workspace display for plan review; Session paths and execution policy remain real. */
export const name = 'plan-runtime-context-fixture'
export const inject = ['systemPrompt', 'agents', 'sandboxPolicy']

/**
 * Replace only the named context fields' temporary workspace text.
 * @param ctx - scenario plugin context.
 */
export function apply(ctx) {
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.systemPrompt.context({
      name: 'working-directory:current', order: 0, required: true,
      text: 'Current working directory: the scenario workspace.', interpolate: false,
    })
  })
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next()
    if (context.agent === undefined) return assembly
    const directory = assembly.contexts.find(entry => entry.name === 'working-directory:current')
    const sandbox = assembly.contexts.find(entry => entry.name === 'sandbox:policy')
    if (directory === undefined || sandbox === undefined) throw new Error('Plan scenario requires directory and sandbox context')
    const policy = ctx.sandboxPolicy.resolve({ session: context.agent.session })
    const quotedRoot = JSON.stringify(policy.workspaceRoot)
    if (policy.mode !== 'workspace-write' || !sandbox.text.includes(quotedRoot)) {
      throw new Error('Plan scenario requires the actual workspace-write policy')
    }
    directory.text = 'Current working directory: the scenario workspace.'
    sandbox.text = sandbox.text.replace(quotedRoot, '"the scenario workspace"')
    return assembly
  }, { prepend: true })
}
