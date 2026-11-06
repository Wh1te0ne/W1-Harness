// Register W1 shortcuts with the same Windows identity as the running application.
const { app, shell, nativeTheme } = require('electron')
const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '../..')
const evidence = join(root, '.work/local-dev/launcher')
mkdirSync(evidence, { recursive: true })
app.setPath('userData', join(evidence, 'setup-user-data'))

app.whenReady().then(() => {
  const directory = process.env.W1_LAUNCHER_INSTALL_DIRECTORY
  if (!directory) throw new Error('Launcher installation directory is required')
  const target = join(directory, 'W1 Harness.exe')
  if (!existsSync(target)) throw new Error('Build the W1 launcher before installing shortcuts')
  const theme = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? 'dark' : 'light'
  const sourceIcon = join(root, `apps/desktop/resources/w1-app-${theme}.ico`)
  const digest = createHash('sha256').update(readFileSync(sourceIcon)).digest('hex').slice(0, 16)
  const icon = join(directory, 'icons', `w1-app-${digest}.ico`)
  mkdirSync(join(directory, 'icons'), { recursive: true })
  if (!existsSync(icon)) copyFileSync(sourceIcon, icon)
  const product = JSON.parse(readFileSync(join(root, 'apps/desktop/w1-product.json'), 'utf8'))
  const appId = `${product.appId}.dev`
  const programs = join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs')
  const desktop = app.getPath('desktop')
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const backup = join(directory, 'backups', stamp)
  mkdirSync(programs, { recursive: true })
  mkdirSync(desktop, { recursive: true })
  const taskbarOnly = process.argv.includes('--taskbar-only')
  const pinned = join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', 'W1 Harness.lnk')
  const paths = taskbarOnly ? [] : [join(desktop, 'W1 Harness.lnk'), join(programs, 'W1 Harness.lnk')]
  if (existsSync(pinned)) paths.push(pinned)
  if (taskbarOnly && paths.length === 0) throw new Error('W1 taskbar shortcut was not found')
  const previous = join(desktop, 'W1 Harness 开发版.lnk')
  if (!taskbarOnly && existsSync(previous)) paths.push(previous)
  const results = []
  for (const [index, path] of paths.entries()) {
    const current = existsSync(path) ? shell.readShortcutLink(path) : undefined
    const retarget = current?.target.toLowerCase() !== target.toLowerCase()
    if (current) {
      const owned = (current.appUserModelId === product.appId || current.appUserModelId === appId)
        || !retarget
        || (current.target.includes('W1 Harness') && current.target.endsWith('.exe'))
        || current.args.includes(join(root, 'scripts/w1/Start-W1.ps1'))
      if (!owned) throw new Error(`Existing shortcut is not owned by W1: ${path}`)
      if (!retarget && current.icon === icon && current.iconIndex === 0 && current.appUserModelId === appId) {
        results.push({ path, ...current })
        continue
      }
      mkdirSync(backup, { recursive: true })
      copyFileSync(path, join(backup, `${index}.lnk`))
    }
    const details = retarget ? { ...current, target, args: '', cwd: directory, description: product.name } : {}
    const operation = current === undefined ? 'create' : retarget ? 'replace' : 'update'
    if (!shell.writeShortcutLink(path, operation, { ...details, icon, iconIndex: 0, appUserModelId: appId })) throw new Error(`Cannot write shortcut: ${path}`)
    const actual = shell.readShortcutLink(path)
    if (actual.target.toLowerCase() !== target.toLowerCase() || actual.icon !== icon
      || actual.iconIndex !== 0 || actual.appUserModelId !== appId) throw new Error(`Shortcut verification failed: ${path}`)
    results.push({ path, ...actual })
  }
  writeFileSync(join(evidence, 'shortcuts.json'), JSON.stringify({ backup, shortcuts: results }, null, 2) + '\n')
  app.exit(0)
}).catch(error => { console.error(error.message); app.exit(1) })
