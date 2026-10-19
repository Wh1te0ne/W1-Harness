/** Validate daily startup inputs without importing the TypeScript development toolchain. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const json = path => JSON.parse(readFileSync(path, 'utf8'))

/** Return whether prepared project links match the current built application and runtime. */
export function preparedProjectMatches({ root, electron, runtime, cacheDirectory, hostProtocolVersion, probeNodeVersion }) {
  const app = join(root, 'apps/desktop')
  for (const path of [join(app, 'lib/main.js'), join(root, 'apps/desktop-host/lib/index.js'), join(runtime, 'runtime.json')]) {
    if (!existsSync(path)) throw new Error(`W1 prepared artifact missing: ${path}`)
  }
  const binary = statSync(electron)
  const fingerprint = createHash('sha256').update(JSON.stringify([realpathSync(electron), binary.size, binary.mtimeMs])).digest('hex')
  const cache = join(cacheDirectory, `electron-node-${fingerprint}.json`)
  let nodeVersion
  if (existsSync(cache)) {
    try { nodeVersion = json(cache).nodeVersion } catch { /* A partial cache must be rebuilt. */ }
  }
  if (typeof nodeVersion !== 'string' || !/^\d+\.\d+\.\d+$/u.test(nodeVersion)) {
    nodeVersion = probeNodeVersion ? probeNodeVersion(electron) : execFileSync(electron, ['-p', 'process.versions.node'], {
      encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
    }).trim()
    if (!/^\d+\.\d+\.\d+$/u.test(nodeVersion)) throw new Error('Invalid Electron Node version')
    mkdirSync(cacheDirectory, { recursive: true })
    const temporary = `${cache}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify({ nodeVersion }) + '\n')
    renameSync(temporary, cache)
  }
  const descriptor = join(app, '.desktop-build/development/project/desktop-runtime.json')
  if (!existsSync(descriptor)) return false
  const release = json(descriptor).release
  return release?.version === json(join(app, 'package.json')).version
    && release.nodeVersion === nodeVersion && release.hostProtocolVersion === hostProtocolVersion
    && release.pnpmVersion === json(join(app, 'node_modules/pnpm/package.json')).version
}
