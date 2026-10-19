/** Add a no-argument entry to the owned Electron copy without altering its upstream archive. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

/** Prepare or validate the owned shell entry; refuse unknown archives and preserve the original loader. */
export async function prepareWindowsEntry(directory, originalArchive, asar) {
  const resources = join(directory, 'resources')
  const archive = join(resources, 'default_app.asar')
  const original = join(resources, 'w1-electron-default.asar')
  const stamp = join(resources, 'w1-entry.json')
  const entry = readFileSync(new URL('./shell-default-entry.mjs', import.meta.url))
  const originalHash = digest(readFileSync(originalArchive)), entryHash = digest(entry)
  const currentHash = existsSync(archive) ? digest(readFileSync(archive)) : null
  const previous = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')) : null
  if (previous?.entryHash === entryHash && previous.originalHash === originalHash && currentHash === previous.archiveHash
    && existsSync(original) && digest(readFileSync(original)) === originalHash) return { changed: false }
  if (currentHash !== originalHash && currentHash !== previous?.archiveHash) throw new Error('Refusing to replace an unrecognized W1 default application archive')
  if (existsSync(original) && digest(readFileSync(original)) !== originalHash) throw new Error('W1 original Electron loader does not match this runtime')
  mkdirSync(resources, { recursive: true })
  if (!existsSync(original)) copyFileSync(originalArchive, original)
  const temporary = mkdtempSync(join(resources, 'w1-entry-'))
  const next = temporary + '.asar'
  try {
    writeFileSync(join(temporary, 'package.json'), JSON.stringify({ name: 'w1-harness-entry', productName: 'W1 Harness', type: 'module', main: 'main.mjs' }))
    writeFileSync(join(temporary, 'main.mjs'), entry)
    const archiveTool = typeof asar === 'function' ? asar() : asar
    await archiveTool.createPackage(temporary, next)
    const archiveHash = digest(readFileSync(next))
    renameSync(next, archive)
    writeFileSync(stamp, JSON.stringify({ schema: 1, entryHash, originalHash, archiveHash }, null, 2) + '\n')
  } finally {
    if (existsSync(next)) unlinkSync(next)
    for (const file of ['package.json', 'main.mjs']) if (existsSync(join(temporary, file))) unlinkSync(join(temporary, file))
    rmdirSync(temporary)
  }
  return { changed: true }
}
