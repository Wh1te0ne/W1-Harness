/** Build one local W1 surface using the existing workspace artifacts and runtime. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
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
  if (directory !== resolve(root, 'apps/desktop') && !directory.startsWith(resolve(root, 'packages') + sep)) throw new Error('Select desktop, shell, or one packages/ directory.')
  if (!existsSync(resolve(directory, 'tsconfig.json')) || !existsSync(resolve(directory, 'tsdown.config.ts'))) throw new Error('Selected package has no compiler or bundle config.')
  run([resolve(root, 'node_modules/typescript/bin/tsc'), '-b', directory])
  run([resolve(root, 'node_modules/tsdown/dist/run.mjs'), '--config-loader', 'native'], directory)
}
const seconds = Math.round((performance.now() - started) / 100) / 10
const evidence = resolve(root, '.work/local-dev')
mkdirSync(evidence, { recursive: true })
writeFileSync(resolve(evidence, 'last-build.json'), JSON.stringify({ target, seconds, completedAt: new Date().toISOString() }, null, 2) + '\n')
console.log(`W1 local build: ${target} — ${seconds}s. Client changes reload in the running development app; restart W1 after Host or desktop changes.`)
