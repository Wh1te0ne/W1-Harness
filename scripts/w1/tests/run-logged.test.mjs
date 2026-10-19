import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const entry = fileURLToPath(new URL('../run-logged.mjs', import.meta.url))
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'w1-logged-'))
  t.after(() => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'w1-logged-'))
    rmSync(directory, { recursive: true, force: true })
  })
  return { directory, log: join(directory, 'output.log') }
}
function run(log, command, args, disconnect = false) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(process.execPath, [entry, log, command, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  if (disconnect) { child.stdout.destroy(); child.stderr.destroy() }
  else { child.stdout.resume(); child.stderr.resume() }
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
}
test('waits for delayed output and preserves a failing child exit code', async t => {
  const { log } = fixture(t)
  const code = await run(log, process.execPath, ['-e', "console.log('started');setTimeout(()=>{console.error('finished');process.exitCode=7},50)"])
  assert.equal(code, 7)
  assert.match(readFileSync(log, 'utf8'), /started[\s\S]*finished/)
})
test('child logging survives the launcher output reader disconnecting', async t => {
  const { log } = fixture(t)
  const code = await run(log, process.execPath, ['-e', "setTimeout(()=>{process.stdout.write('stdout-ok\\n');process.stderr.write('stderr-ok\\n')},50)"], true)
  assert.equal(code, 0)
  assert.match(readFileSync(log, 'utf8'), /stdout-ok[\s\S]*stderr-ok/)
})
test('waits for a real Windows Electron GUI executable without a console pipe', { skip: process.platform !== 'win32' }, async t => {
  const { directory, log } = fixture(t)
  const app = join(directory, 'probe.cjs')
  writeFileSync(app, "const {app}=require('electron');app.setPath('userData',__dirname+'/profile');app.whenReady().then(()=>{console.log('gui-ready');setTimeout(()=>{console.error('gui-finished');app.exit(0)},50)})")
  const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url))
  assert.equal(await run(log, require('electron'), [app], true), 0)
  assert.match(readFileSync(log, 'utf8'), /gui-ready[\s\S]*gui-finished/)
})
