// Register W1 shortcuts with the same Windows identity as the running application.
const { app, shell } = require('electron')
const { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '../..')
const evidence = join(root, '.work/local-dev/launcher')
mkdirSync(evidence, { recursive: true })
app.setPath('userData', join(evidence, 'setup-user-data'))

app.whenReady().then(async () => {
  const directory = process.env.W1_LAUNCHER_INSTALL_DIRECTORY
  if (!directory) throw new Error('Launcher installation directory is required')
  const target = join(directory, 'W1 Harness.exe')
  if (!existsSync(target)) throw new Error('Build the W1 launcher before installing shortcuts')
  const icon = join(directory, 'w1-app.ico')
  copyFileSync(join(root, 'assets/w1/exports/app-icon.ico'), icon)
  const product = JSON.parse(readFileSync(join(root, 'apps/desktop/w1-product.json'), 'utf8'))
  const appId = `${product.appId}.dev`
  const programs = join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs')
  const desktop = app.getPath('desktop')
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const backup = join(directory, 'backups', stamp)
  mkdirSync(programs, { recursive: true })
  mkdirSync(desktop, { recursive: true })
  const paths = [join(desktop, 'W1 Harness.lnk'), join(programs, 'W1 Harness.lnk')]
  const previous = join(desktop, 'W1 Harness 开发版.lnk')
  if (existsSync(previous)) paths.push(previous)
  const results = []
  for (const [index, path] of paths.entries()) {
    if (existsSync(path)) {
      const current = shell.readShortcutLink(path)
      const owned = (current.appUserModelId === product.appId || current.appUserModelId === appId)
        || current.target.toLowerCase() === target.toLowerCase()
        || (current.target.includes('W1 Harness') && current.target.endsWith('.exe'))
        || current.args.includes(join(root, 'scripts/w1/Start-W1.ps1'))
      if (!owned) throw new Error(`Existing shortcut is not owned by W1: ${path}`)
      mkdirSync(backup, { recursive: true })
      copyFileSync(path, join(backup, `${index}.lnk`))
    }
    const details = { target, args: '', cwd: root, description: 'W1 Harness · 本机日用开发版',
      icon, iconIndex: 0, appUserModelId: appId }
    if (!shell.writeShortcutLink(path, 'create', details)) throw new Error(`Cannot write shortcut: ${path}`)
    const actual = shell.readShortcutLink(path)
    if (actual.target !== target || actual.icon !== icon || actual.appUserModelId !== appId) throw new Error(`Shortcut verification failed: ${path}`)
    const rendered = await app.getFileIcon(path, { size: 'normal' })
    if (rendered.isEmpty()) throw new Error(`Windows returned an empty shortcut icon: ${path}`)
    writeFileSync(join(evidence, `shortcut-icon-${index}.png`), rendered.toPNG())
    results.push({ path, ...actual })
  }
  writeFileSync(join(evidence, 'shortcuts.json'), JSON.stringify({ backup, shortcuts: results }, null, 2) + '\n')
  app.exit(0)
}).catch(error => { console.error(error.message); app.exit(1) })
