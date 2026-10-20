/** Stage the browser capability and affected desktop entries without touching running bundles. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { build } from 'tsdown'
import { queuePackageBuild } from './pending-builds.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = join(root, '.work/local-dev/pending-artifacts', randomUUID())
mkdirSync(output, { recursive: true })
const guidanceOnly = process.argv.includes('--guidance-only')
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-b',
  'packages/w1/tool-selection', 'packages/w1/browser-use', 'packages/w1/chrome-use', 'apps/desktop-host',
  ...guidanceOnly ? [] : ['packages/client/ui-sidebar-browser', 'apps/desktop/tsconfig.host.json']], { cwd: root, stdio: 'inherit', windowsHide: true })

const targets = [
  ['packages/w1/tool-selection', '../../packages/w1/tool-selection/tsdown.config.ts'],
  ['packages/w1/browser-use', '../../packages/w1/browser-use/tsdown.config.ts'],
  ['packages/w1/chrome-use', '../../packages/w1/chrome-use/tsdown.config.ts'],
  ['packages/client/ui-sidebar-browser', '../../packages/client/ui-sidebar-browser/tsdown.config.ts'],
  ['apps/desktop-host', '../../apps/desktop-host/tsdown.config.ts'],
  ['apps/desktop', '../../apps/desktop/tsdown.config.ts'],
]
const completed = []
for (const [target, configPath] of targets) {
  if (guidanceOnly && ['packages/client/ui-sidebar-browser', 'apps/desktop'].includes(target)) continue
  const stage = join(output, target.replaceAll('/', '-'))
  const cwd = resolve(root, target)
  process.chdir(cwd)
  const { default: exported } = await import(new URL(configPath, import.meta.url).href)
  const resolved = typeof exported === 'function' ? await exported({ env: process.env }) : await exported
  const configs = Array.isArray(resolved) ? resolved : [resolved]
  for (const config of configs) {
    const entries = Object.values(config.entry ?? {}).join(' ')
    if (target === 'apps/desktop' && !/\bmain\.js|\bpreload-app\.js/u.test(entries)) continue
    if (target === 'apps/desktop-host' && !entries.includes('index.js')) continue
    await build({ ...config, config: false, cwd, outDir: stage, clean: false, onSuccess: undefined,
      // This newly added plugin has no active predecessor. Resolve its source while its first bundle remains staged.
      alias: { ...config.alias, ...target === 'apps/desktop-host' ? {} : {
        '@deepseek-ai/dsh-w1-browser-use/protocol': join(root, 'packages/w1/browser-use/src/protocol.ts'),
        '@deepseek-ai/dsh-w1-browser-use/page': join(root, 'packages/w1/browser-use/src/page.ts'),
        '@deepseek-ai/dsh-w1-browser-use': join(root, 'packages/w1/browser-use/src/index.ts'),
      } },
    })
  }
  const required = target === 'apps/desktop' ? ['main.js', 'preload-app.cjs']
    : target === 'packages/client/ui-sidebar-browser' ? ['index.js', 'client.js']
      : target === 'packages/w1/browser-use' ? ['index.js', 'protocol.js', 'page.js'] : ['index.js']
  for (const file of required) if (!existsSync(join(stage, file))) throw new Error(`Missing staged artifact: ${target}/${file}`)
  completed.push([target, stage])
}
process.chdir(root)
for (const [target, stage] of completed) queuePackageBuild(root, target, stage)
console.info('Browser capability staged for the next normal W1 start:', output)
