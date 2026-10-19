/** Run a local W1 process with file-owned output handles and await its exit. */
import { spawn } from 'node:child_process'
import { openSync, closeSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [logPath, command, ...args] = process.argv.slice(2)
if (!logPath || !command) throw new Error('Usage: run-logged.mjs <log> <command> [args...]')
const output = openSync(logPath, 'a')
let child
try {
  child = spawn(command, args, {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    stdio: ['ignore', output, output],
    windowsHide: true,
  })
} finally {
  // spawn duplicates the file handle for the child; no launcher pipe carries logs.
  closeSync(output)
}
process.exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (code) => resolve(code ?? 1))
})
