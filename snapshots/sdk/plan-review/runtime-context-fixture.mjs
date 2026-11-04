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
    agent.ctx.systemPrompt.context({
      name: 'sandbox:policy', order: ctx.systemPrompt.getContextOrder('SANDBOX_POLICY'), interpolate: false,
      text: () => {
        const policy = ctx.sandboxPolicy.resolve({ session: agent.session })
        if (policy.mode !== 'workspace-write' || (policy.additionalWritableRoots?.length ?? 0) !== 0) {
          throw new Error('Plan scenario requires workspace-write without additional writable roots')
        }
        return 'Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: "the scenario workspace". Some platform temporary areas may also be writable.'
      },
    })
  })
}
