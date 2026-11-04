import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { boot } from '../src/index.ts'
import { installStartupTiming, type StartupTiming } from '../src/startup-timing.ts'

let ctx: Context | undefined
let root: string | undefined
afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllEnvs()
})

it('separates import, dependency waiting and activation in a real Loader tree and detaches after boot', async () => {
  vi.stubEnv('DSH_STARTUP_TRACE', '0')
  root = mkdtempSync(join(tmpdir(), 'dsh-startup-timing-'))
  writeFileSync(join(root, 'slow.mjs'), `
await new Promise(resolve => setTimeout(resolve, 30))
export async function apply(ctx) {
  await new Promise(resolve => setTimeout(resolve, 40))
  ctx.provide('startupTimed', {})
}`)
  writeFileSync(join(root, 'consumer.mjs'), `
export const inject = ['startupTimed']
export async function apply() { await new Promise(resolve => setTimeout(resolve, 10)) }
`)
  writeFileSync(join(root, 'cordis.yml'), `
- id: slow
  name: ./slow.mjs
  config: { privateValue: NEVER_LOG_THIS }
- id: consumer
  name: ./consumer.mjs
`)
  const records: StartupTiming[] = []
  let finish: (() => void) | undefined
  ctx = await boot('timing', join(root, 'cordis.yml'), [], (host) => {
    finish = installStartupTiming(host, record => records.push(record))
  })
  finish!()
  expect(records.some(row => row.phase === 'import' && row.durationMs >= 25)).toBe(true)
  const slow = records.find(row => row.phase === 'activate' && row.entry === 'slow')
  expect(slow?.durationMs).toBeGreaterThanOrEqual(35)
  const consumer = records.find(row => row.phase === 'activate' && row.entry === 'consumer')
  expect(consumer?.waitMs).toBeGreaterThanOrEqual(35)
  expect(consumer?.durationMs).toBeGreaterThanOrEqual(5)
  expect(JSON.stringify(records)).not.toContain('NEVER_LOG_THIS')
  expect(JSON.stringify(records)).not.toContain(root)
  const count = records.length
  finish!()
  await ctx.plugin(() => {})
  expect(records).toHaveLength(count)
})

it('reports failed imports without exposing error bodies', async () => {
  vi.stubEnv('DSH_STARTUP_TRACE', '0')
  root = mkdtempSync(join(tmpdir(), 'dsh-startup-timing-'))
  writeFileSync(join(root, 'bad.mjs'), 'throw new Error("PRIVATE_ERROR_BODY")')
  writeFileSync(join(root, 'cordis.yml'), '- id: bad\n  name: ./bad.mjs\n')
  const records: StartupTiming[] = []
  let finish: (() => void) | undefined
  ctx = await boot('timing', join(root, 'cordis.yml'), [], (host) => {
    finish = installStartupTiming(host, record => records.push(record))
  })
  finish!()
  expect(records.some(row => row.phase === 'import' && row.outcome === 'failed')).toBe(true)
  expect(JSON.stringify(records)).not.toContain('PRIVATE_ERROR_BODY')
})
