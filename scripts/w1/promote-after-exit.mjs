/** Apply a reviewed source/bundle handoff after the daily W1 process tree exits. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Launcher-only files that may be installed before the running application exits. */
export const BOOTSTRAP_SOURCES = new Set([
  'scripts/w1/Start-W1.ps1',
  'scripts/w1/Show-W1Startup.ps1',
  'scripts/w1/resume-promotion.mjs',
  'scripts/w1/promote-after-exit.mjs',
  'scripts/w1/w1-running.mjs',
])

const digest = file => existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null
function inside(root, name) {
  const path = resolve(root, name)
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Promotion path escapes its root')
  let cursor = resolve(root)
  for (const part of relative(root, path).split(sep)) {
    cursor = join(cursor, part)
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Promotion path contains a link')
  }
  return path
}
function state(directory, value) {
  const file = join(directory, 'status.json')
  writeFileSync(file + '.tmp', JSON.stringify({ ...value, updatedAt: new Date().toISOString() }) + '\n')
  renameSync(file + '.tmp', file)
}
function replace(source, target) {
  mkdirSync(dirname(target), { recursive: true })
  const temporary = target + '.w1-promote-' + process.pid
  copyFileSync(source, temporary)
  renameSync(temporary, target)
}

/** Validate the complete handoff before changing source; bundle publication owns runtime rollback. */
export async function applyPreparedPromotion(directory, isRunning) {
  directory = resolve(directory)
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
  const root = resolve(manifest.dailyRoot)
  inside(join(root, '.work/daily-updates'), directory)
  if (!/^[a-f0-9-]{36}$/u.test(manifest.id)
    || manifest.bundles.some(bundle => !/^(?:packages\/[a-z0-9-]+\/[a-z0-9-]+|apps\/(?:desktop|desktop-host|web))$/u.test(bundle.target))) {
    throw new Error('Invalid promotion target')
  }
  if (isRunning()) throw new Error('Exit W1 before applying the daily update')
  if (manifest.rootHead && execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim() !== manifest.rootHead) {
    throw new Error('Daily Git revision changed since preparation')
  }
  const queue = join(root, '.work/local-dev/pending-builds')
  const allowed = new Map(manifest.bundles.map(bundle => [bundle.target.replaceAll('/', '-') + '.json', bundle]))
  for (const name of existsSync(queue) ? readdirSync(queue).filter(name => name.endsWith('.json')) : []) {
    const bundle = allowed.get(name)
    if (!bundle) throw new Error('Another pending update must be handled before this handoff')
    const current = JSON.parse(readFileSync(join(queue, name), 'utf8'))
    if (resolve(root, current.stage) !== resolve(root, '.work/local-dev/pending-artifacts', manifest.id, bundle.target)) {
      throw new Error('A newer bundle is already queued: ' + bundle.target)
    }
  }
  const previous = existsSync(join(directory, 'status.json')) ? JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8')) : {}
  if (previous.phase === 'applied') return 0
  const sources = manifest.sources.map(entry => {
    if (!/^(?:packages|apps|scripts)\//u.test(entry.file)) throw new Error('Unsupported source destination')
    const target = inside(root, entry.file)
    const payload = inside(join(directory, 'sources'), entry.file)
    const backup = inside(join(directory, 'backup'), entry.file)
    if (entry.sha256 !== null && digest(payload) !== entry.sha256) throw new Error('Candidate source changed: ' + entry.file)
    if (entry.before !== null && digest(backup) !== entry.before) throw new Error('Source backup changed: ' + entry.file)
    const current = digest(target)
    if (entry.preinstalled && !BOOTSTRAP_SOURCES.has(entry.file)) throw new Error('Unsupported bootstrap source: ' + entry.file)
    const acceptsCandidate = previous.sourceApplied || entry.preinstalled === true
    if (current !== entry.before && !(acceptsCandidate && current === entry.sha256)) throw new Error('Daily source changed since preparation: ' + entry.file)
    return { ...entry, target, payload, backup }
  })
  for (const bundle of manifest.bundles) for (const entry of bundle.entries) {
    const path = inside(join(directory, 'bundles', bundle.target), entry.file)
    if (digest(path) !== entry.sha256) throw new Error('Candidate bundle changed: ' + bundle.target)
    const backup = inside(join(directory, 'runtime-backup', bundle.target), entry.file)
    if (entry.before !== null && digest(backup) !== entry.before) throw new Error('Runtime backup changed: ' + bundle.target)
    const active = digest(inside(join(root, bundle.target, bundle.target === 'apps/web' ? 'dist' : 'lib'), entry.file))
    if (active !== entry.before && !(previous.sourceApplied && active === entry.sha256)) throw new Error('Daily bundle changed since preparation')
  }
  const lock = join(root, '.work/local-dev/promotion.lock')
  mkdirSync(dirname(lock), { recursive: true })
  writeFileSync(lock, String(process.pid), { flag: 'wx' })
  const written = []
  let sourceApplied = previous.sourceApplied === true
  try {
    if (isRunning()) throw new Error('W1 restarted before promotion; retry after exit')
    if (!sourceApplied) {
      state(directory, { phase: 'applying-source', sourceApplied: false })
      try {
        // The launcher is installed last, after all of its newly imported helpers exist.
        for (const entry of sources.sort((a, b) => Number(a.file.endsWith('Start-W1.ps1')) - Number(b.file.endsWith('Start-W1.ps1')))) {
          written.push(entry)
          if (entry.sha256 === null) { if (existsSync(entry.target)) unlinkSync(entry.target) }
          else replace(entry.payload, entry.target)
        }
      } catch (error) {
        for (const entry of written.reverse()) {
          if (entry.before === null) { if (existsSync(entry.target)) unlinkSync(entry.target) }
          else replace(entry.backup, entry.target)
        }
        throw error
      }
      sourceApplied = true
      state(directory, { phase: 'source-ready', sourceApplied })
    }
    const publisher = await import(pathToFileURL(join(root, 'scripts/w1/pending-builds.mjs')).href)
    for (const bundle of manifest.bundles) {
      const output = inside(join(root, '.work/local-dev/pending-artifacts'), join(manifest.id, bundle.target))
      for (const entry of bundle.entries) replace(inside(join(directory, 'bundles', bundle.target), entry.file), inside(output, entry.file))
      publisher.queuePackageBuild(root, bundle.target, output)
    }
    const count = publisher.publishPendingBuilds(root, isRunning)
    state(directory, { phase: 'applied', sourceApplied, bundles: count })
    return count
  } catch (error) {
    state(directory, { phase: 'failed', sourceApplied, message: error.message })
    throw error
  } finally { unlinkSync(lock) }
}

if (import.meta.main) {
  const directory = resolve(process.argv[2] ?? '')
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
  const probe = "$ErrorActionPreference='Stop'; $owned = @(Get-CimInstance Win32_Process -Filter \"Name='W1 Harness.exe'\" | Where-Object { $_.ExecutablePath -eq $env:W1_PROMOTION_SHELL -or $_.ExecutablePath -eq $env:W1_PROMOTION_LAUNCHER }); "
  const inspect = command => execFileSync('C:/Program Files/PowerShell/7/pwsh.exe', ['-NoProfile', '-Command', probe + command],
    { encoding: 'utf8', windowsHide: true, timeout: 35000, env: { ...process.env,
      W1_PROMOTION_SHELL: manifest.shell, W1_PROMOTION_LAUNCHER: manifest.launcher } })
  const running = () => {
    const result = inspect('$owned.Count')
    const count = Number(result.trim())
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Could not inspect the daily W1 process tree')
    return count !== 0
  }
  try {
    const deadline = Date.now() + 12 * 60 * 60 * 1000
    const prior = existsSync(join(directory, 'status.json')) ? JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8')) : {}
    if (prior.phase === 'applied') process.exit(0)
    state(directory, { phase: 'waiting-for-exit', pid: process.pid, sourceApplied: prior.sourceApplied === true })
    let expired = false
    while (running()) {
      if (JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8')).phase === 'applied') break
      if (Date.now() > deadline) {
        state(directory, { phase: 'prepared', sourceApplied: prior.sourceApplied === true })
        expired = true
        break
      }
      inspect('if ($owned.Count) { Wait-Process -Id $owned.ProcessId -Timeout 30 -ErrorAction SilentlyContinue }; exit 0')
    }
    if (!expired && JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8')).phase !== 'applied') {
      await applyPreparedPromotion(directory, running)
    }
  } catch (error) {
    const previous = JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8'))
    state(directory, { ...previous, phase: 'failed', message: error.message })
    process.exitCode = 1
  }
}
