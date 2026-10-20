/** Product-level tool selection guidance, composed through the existing prompt service. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'w1-tool-selection'
export const inject = ['systemPrompt', 'tools']

const GENERAL = `## Tool selection
Choose tools proactively when they help complete the user's current task; the user need not name a tool. This does not authorize unrelated background work. Respect explicit targets, read-only requests, and restrictions on browser, desktop, or native acceptance testing.
Use only tools available in this conversation. Follow applicable skill instructions; load a matching skill before its workflow. Prefer a suitable dedicated tool or connected service for its supported operation. Use file tools for supported file operations and Shell for builds, tests, processes, or operations without a suitable dedicated tool. Do not use Shell or another channel to bypass a denied action.
For information lookup, use search to discover sources and page fetching for a known URL's text. Use browser interaction when rendering, visual inspection, page state, or interaction is necessary; do not open a browser for every text lookup. If ordinary fetching cannot supply the needed rendered content, consider an available browser.
Discover a relevant deferred tool through the available tool catalog when needed; do not invent tool names or assume a connected service has access. Tool selection does not grant permission: follow the current task authorization and execution policy. Ask only for a missing prerequisite that prevents the next necessary action.
Verify outcomes with the appropriate observation or check. A tool call succeeding is not proof that the user's objective succeeded. Report what was checked and what remains unverified.`

const BROWSER_ENVIRONMENT = `## Browser environment selection
Honor an explicitly named browser or tab first. Within that environment, reuse the relevant conversation-owned tab before opening another. Do not silently switch environments when the requested target is unavailable.
Browser environments have separate state; never assume shared tabs, cookies, or login state between the built-in browser and the user's regular Chrome profile.`
const BUILT_IN = 'Use w1_browser for localhost development, frontend rendering and interaction checks, and sites that do not require the user\'s existing external-browser session. Its state is separate from the user\'s regular Chrome profile.'
const CHROME = 'Use w1_chrome for an explicitly requested external Chrome tab, an existing signed-in Chrome session, or an already-open external business page. The enabled extension connects automatically: list available tabs, filter by title or URL when needed, and select the relevant tab yourself. Do not ask the user to paste codes or share individual tabs. If disconnected, connect waits briefly for the extension. Respect user pauses and other conversations\' tab leases; do not silently replace this environment with the built-in browser.'
const NO_CHROME = 'External Chrome control is unavailable in this conversation. If existing external tabs or login state are required, explain the missing capability; do not access profile files, install an extension, or substitute desktop control to bypass this limitation.'

/** Register product guidance; capability-specific advice follows scoped tool visibility. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'w1:tool-selection',
    order: ctx.systemPrompt.getSectionOrder('PLAN_POLICY'),
    text: ({ scope }) => {
      const builtIn = ctx.tools.get('w1_browser', scope) !== undefined
      const chrome = ctx.tools.get('w1_chrome', scope) !== undefined
      return [GENERAL, ...builtIn || chrome ? [BROWSER_ENVIRONMENT, ...builtIn ? [BUILT_IN] : [], chrome ? CHROME : NO_CHROME] : []].join('\n\n')
    },
  })
}
