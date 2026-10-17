/** Upgrade only W1 project metadata; Session logs and original DSH data are untouched. */
import { readFile, writeFile, mkdir, rename, copyFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

/** Back up and atomically upgrade v2 records. Repeated launches make no further changes. */
export async function migrateProjects(home) {
  if (basename(resolve(home)) !== '.w1-harness') throw new Error('Project migration requires the W1 private home')
  const file = join(home, 'storages', 'workspace.json')
  let original
  try { original = await readFile(file, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return { status: 'fresh' }; throw error }
  const state = JSON.parse(original)
  if (state.unit?.name !== 'workspace') throw new Error('Unexpected project storage unit')
  if (state.unit.version === 3) return { status: 'current' }
  if (state.unit.version !== 2) throw new Error('Unsupported project storage version')
  if (!state.tables?.workspaces || !Array.isArray(state.global?.workspaceIds)) throw new Error('Invalid project storage')
  for (const record of Object.values(state.tables.workspaces)) {
    if (typeof record.path !== 'string' || typeof record.title !== 'string' || !Array.isArray(record.sessionIds)) throw new Error('Invalid project record')
    if (record.folderRoots !== undefined || record.primaryFolderId !== undefined) throw new Error('Unexpected project fields in v2 data')
    record.folderRoots = [{ id: 'primary', path: record.path }]
    record.primaryFolderId = 'primary'
  }
  state.unit.version = 3
  const backup = join(dirname(resolve(home)), '.w1-harness-backups', 'projects-v3-' + new Date().toISOString().replaceAll(':', '-'))
  await mkdir(backup, { recursive: true })
  await copyFile(file, join(backup, 'workspace-v2.json'))
  const hash = text => createHash('sha256').update(text).digest('hex')
  if (hash(await readFile(file, 'utf8')) !== hash(original)) throw new Error('Project storage changed during migration; close W1 and retry')
  const temporary = file + '.v3-' + process.pid + '.tmp'
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
  await rename(temporary, file)
  return { status: 'migrated', projects: Object.keys(state.tables.workspaces).length, backup }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await migrateProjects(process.argv[2])))
}
