/** Install only the next-launch entry before an already reviewed daily update. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { BOOTSTRAP_SOURCES } from './promote-after-exit.mjs'

const digest = file => existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null

/**
 * Verify frozen launcher payloads and backups, record preinstallation, then replace Start-W1 last.
 * Application sources, runtime bundles and user data are never installed here.
 * @param directory - reviewed handoff directory under the daily checkout.
 * @returns installed launcher-only paths.
 */
export function installPromotionBootstrap(directory) {
  directory = resolve(directory)
  const manifestFile = join(directory, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const root = resolve(manifest.dailyRoot)
  if (!directory.startsWith(join(root, '.work/daily-updates') + sep)) throw new Error('Invalid bootstrap handoff location')
  if (existsSync(join(root, '.work/local-dev/promotion.lock'))) throw new Error('A publication already owns the launcher')
  const state = JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8'))
  if (!['prepared', 'waiting-for-exit'].includes(state.phase) || state.sourceApplied) throw new Error('Bootstrap requires an unapplied handoff')
  const pointer = join(root, '.work/local-dev/pending-promotion.json')
  if (existsSync(pointer)) {
    const current = JSON.parse(readFileSync(pointer, 'utf8')).id
    if (current !== manifest.id && current !== manifest.supersedes) throw new Error('Another handoff owns the startup pointer')
  }
  const entries = [...BOOTSTRAP_SOURCES].map(file => {
    const entry = manifest.sources.find(value => value.file === file)
    if (!entry || entry.sha256 === null) throw new Error('Missing bootstrap source: ' + file)
    if (digest(join(directory, 'sources', file)) !== entry.sha256) throw new Error('Bootstrap candidate changed: ' + file)
    if (digest(join(directory, 'backup', file)) !== entry.before) throw new Error('Bootstrap backup changed: ' + file)
    const current = digest(join(root, file))
    if (current !== entry.before && !(entry.preinstalled && current === entry.sha256)) throw new Error('Launcher changed since preparation: ' + file)
    return entry
  })
  for (const entry of entries) entry.preinstalled = true
  writeFileSync(manifestFile + '.tmp', JSON.stringify(manifest, null, 2) + '\n')
  renameSync(manifestFile + '.tmp', manifestFile)
  // Dependencies are available before the ordinary shortcut can reach the new entry.
  for (const entry of entries.sort((a, b) => Number(a.file.endsWith('Start-W1.ps1')) - Number(b.file.endsWith('Start-W1.ps1')))) {
    if (entry.file.endsWith('Start-W1.ps1')) {
      mkdirSync(dirname(pointer), { recursive: true })
      writeFileSync(pointer + '.tmp', JSON.stringify({ id: manifest.id }) + '\n')
      renameSync(pointer + '.tmp', pointer)
    }
    const target = join(root, entry.file)
    mkdirSync(dirname(target), { recursive: true })
    const temporary = target + '.w1-bootstrap-' + process.pid
    copyFileSync(join(directory, 'sources', entry.file), temporary)
    renameSync(temporary, target)
  }
  return entries.map(entry => entry.file)
}

if (import.meta.main) {
  console.log(JSON.stringify({ installed: installPromotionBootstrap(process.argv[2]) }))
}
