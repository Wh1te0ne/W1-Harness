/** Build one local W1 surface using the existing workspace artifacts and runtime. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, sep, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildInPlace } from './build-guard.mjs'
import { queuePackageBuild } from './pending-builds.mjs'
import { fileURLToPath } from 'node:url'
import { clientBuildProcessEnvironment, repositoryClientBuildEnvironment } from '../client-build-environment.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const target = process.argv[2] ?? 'packages/client/ui-brand-official'
const env = clientBuildProcessEnvironment(process.env, repositoryClientBuildEnvironment(root))
const pnpm = resolve(root, 'node_modules/pnpm/bin/pnpm.cjs')
const started = performance.now()
function run(args: string[], cwd = root): void {
  execFileSync(process.execPath, args, { cwd, env, stdio: 'inherit' })
}
if (target === 'shell') run([pnpm, '--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build'])
else {
  const directory = resolve(root, target === 'desktop' ? 'apps/desktop' : target)
  if (directory !== resolve(root, 'apps/desktop') && directory !== resolve(root, 'apps/desktop-host')
    && !directory.startsWith(resolve(root, 'packages') + sep)) throw new Error('Select desktop, shell, apps/desktop-host, or one packages/ directory.')
  if (!existsSync(resolve(directory, 'tsconfig.json'))) throw new Error('Selected package has no compiler config.')
  if (target === 'desktop') {
    // The desktop shell is built in place; a failed build restores the previous output directory.
    buildInPlace(resolve(directory, 'lib'), () => {
      run([resolve(root, 'node_modules/typescript/bin/tsc'), '-b', directory])
      run([resolve(root, 'node_modules/tsdown/dist/run.mjs'), '--config-loader', 'native'], directory)
    })
  } else {
    run([resolve(root, 'node_modules/typescript/bin/tsc'), '-b', directory])
    const output = resolve(root, '.work/local-dev/pending-artifacts', randomUUID())
    const bundleConfig = existsSync(resolve(directory, 'tsdown.config.ts'))
      ? resolve(directory, 'tsdown.config.ts') : resolve(root, 'scripts/w1/tsdown-host.config.ts')
    run([resolve(root, 'node_modules/tsdown/dist/run.mjs'), '--config', bundleConfig, '--config-loader', 'native', '--out-dir', output], directory)
    queuePackageBuild(root, relative(root, directory).split(sep).join('/'), output)
  }
}
const seconds = Math.round((performance.now() - started) / 100) / 10
const evidence = resolve(root, '.work/local-dev')
mkdirSync(evidence, { recursive: true })
writeFileSync(resolve(evidence, 'last-build.json'), JSON.stringify({ target, seconds, completedAt: new Date().toISOString() }, null, 2) + '\n')
console.log(target === 'desktop'
  ? `W1 local build: desktop — ${seconds}s. Restart the test instance to load it; the running UI is not hot-reloaded.`
  : `W1 local build: ${target} — ${seconds}s. Queued for the next launch from this worktree; restart the test instance to apply it.`)
