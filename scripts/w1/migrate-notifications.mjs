/** Retire only W1's optional notification bundle after the built-in module is ready. */
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const yaml = require('js-yaml')

export async function migrateNotifications(home) {
  if (basename(resolve(home)) !== '.w1-harness') throw new Error('Expected W1 private home')
  const profile = join(home, 'profiles', 'desktop'), manifestPath = join(profile, 'package.json')
  let raw
  try { raw = await readFile(manifestPath, 'utf8') } catch (error) { if (error.code === 'ENOENT') return { status: 'fresh' }; throw error }
  const manifest = JSON.parse(raw), bundles = manifest.dsh?.profile?.bundles ?? []
  if (!Object.hasOwn(manifest.dependencies ?? {}, 'dsh-task-notifier') && !bundles.includes('dsh-task-notifier')) return { status: 'current' }
  const backup = join(dirname(resolve(home)), '.w1-harness-backups', 'notifications-builtin-' + new Date().toISOString().replaceAll(':', '-'))
  await mkdir(backup, { recursive: true })
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml']) {
    try { await copyFile(join(profile, name), join(backup, name)) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  delete manifest.dependencies?.['dsh-task-notifier']
  if (manifest.dsh?.profile) manifest.dsh.profile.bundles = bundles.filter(name => name !== 'dsh-task-notifier')
  const lockFile = join(profile, 'pnpm-lock.yaml')
  let lock
  try { lock = yaml.load(await readFile(lockFile, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (lock) {
    for (const importer of Object.values(lock.importers ?? {})) delete importer.dependencies?.['dsh-task-notifier']
    await writeFile(lockFile, yaml.dump(lock, { lineWidth: -1, noRefs: true }))
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return { status: 'migrated', backup, pluginFilesPreserved: true }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await migrateNotifications(process.argv[2])))
