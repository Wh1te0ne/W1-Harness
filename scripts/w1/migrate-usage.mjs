/** Replace W1's optional usage bundles with the application's built-in module. */
import { readFile, writeFile, copyFile, mkdir, lstat, realpath, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const yaml = require('js-yaml')
const legacyNames = ['dsh-usage-manager', 'dsh-cost-meter']
export async function migrateUsage(home) {
  if (basename(resolve(home)) !== '.w1-harness') throw new Error('Expected W1 private home')
  const profile=join(home,'profiles','desktop'), file=join(profile,'package.json')
  let raw
  try {raw=await readFile(file,'utf8')} catch(error) {if(error.code==='ENOENT')return {status:'fresh'};throw error}
  const manifest=JSON.parse(raw), bundles=manifest.dsh?.profile?.bundles ?? []
  if (!legacyNames.some(name=>Object.hasOwn(manifest.dependencies??{},name)||bundles.includes(name))) return {status:'current'}
  const backup=join(dirname(resolve(home)),'.w1-harness-backups','usage-builtin-'+new Date().toISOString().replaceAll(':','-'))
  await mkdir(backup,{recursive:true})
  for(const name of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','cordis.patch.yml']) {
    try {await copyFile(join(profile,name),join(backup,name))} catch(error){if(error.code!=='ENOENT')throw error}
  }
  const ledger=join(home,'storages','cost-meter-custom','ledger.json')
  await copyFile(ledger,join(backup,'ledger.json'))
  const digest=createHash('sha256').update(await readFile(ledger)).digest('hex')
  const current=JSON.parse(await readFile(ledger,'utf8'))
  await writeFile(join(backup,'verification.json'),JSON.stringify({ledgerSha256:digest,profile:resolve(profile),days:current.days,archivedDays:current.archivedDays,manualPrices:current.config?.prices?.manual},null,2))
  const link=join(profile,'node_modules','dsh-usage-manager')
  try {
    const stat=await lstat(link)
    if(!stat.isSymbolicLink())throw new Error('Expected old usage module junction; stopped without removing files')
    const target=await realpath(link),allowed=join(resolve(home),'plugins','dsh-usage-manager')+sep
    if(!target.startsWith(allowed))throw new Error('Unexpected usage link target; stopped')
    await unlink(link)
  } catch(error) {if(error.code!=='ENOENT')throw error}
  for(const name of legacyNames)delete manifest.dependencies?.[name]
  manifest.dsh.profile.bundles=bundles.filter(name=>!legacyNames.includes(name))
  try {
    const lockFile=join(profile,'pnpm-lock.yaml'),lock=yaml.load(await readFile(lockFile,'utf8'))
    for(const importer of Object.values(lock.importers??{}))for(const name of legacyNames)delete importer.dependencies?.[name]
    await writeFile(lockFile,yaml.dump(lock,{lineWidth:-1,noRefs:true}))
  } catch(error) {if(error.code!=='ENOENT')throw error}
  await writeFile(file,JSON.stringify(manifest,null,2)+'\n')
  if(createHash('sha256').update(await readFile(ledger)).digest('hex')!==digest)throw new Error('Ledger changed during migration')
  return {status:'migrated',backup,ledgerUnchanged:true}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await migrateUsage(process.argv[2])))
