/** Prepare a separate test home, optionally copying only the explicitly authorized official DeepSeek reference. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../packages/credentials/credentials-local/package.json', import.meta.url))
const { parse, stringify } = require('yaml')
const testRoot = join(homedir(), '.w1-harness-test')
const credentials = join(testRoot, '.credentials.yaml')
mkdirSync(testRoot, { recursive: true })
if (process.argv.includes('--copy-official-api')) {
  const source = parse(readFileSync(join(homedir(), '.w1-harness/.credentials.yaml'), 'utf8'))
  const value = source?.refs?.DEEPSEEK_API_KEY
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Official DeepSeek reference is not configured in the daily profile')
  if (existsSync(credentials)) {
    const backup = join(testRoot, 'backups', new Date().toISOString().replaceAll(':', '-'))
    mkdirSync(backup, { recursive: true })
    copyFileSync(credentials, join(backup, '.credentials.yaml'))
  }
  writeFileSync(credentials, stringify({ version: 1, refs: { DEEPSEEK_API_KEY: value } }), { mode: 0o600 })
  const check = parse(readFileSync(credentials, 'utf8'))
  if (Object.keys(check.refs).length !== 1 || check.refs.DEEPSEEK_API_KEY !== value) throw new Error('Test credential verification failed')
  console.log('Test profile: official DeepSeek reference copied and verified; no other credentials copied.')
}
const profile = join(testRoot, 'profiles/desktop')
mkdirSync(profile, { recursive: true })
const patch = join(profile, 'cordis.patch.yml')
if (!existsSync(patch)) writeFileSync(patch, '- id: llm-deepseek\n  config:\n    baseURL: https://api.deepseek.com/anthropic\n')
console.log('Test home prepared. Daily profile and histories were not modified.')
