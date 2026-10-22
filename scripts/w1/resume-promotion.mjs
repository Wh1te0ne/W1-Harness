/** Resume a reviewed, not-yet-started daily handoff during a cold launch. */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { applyPreparedPromotion } from './promote-after-exit.mjs'
import { isW1Running } from './w1-running.mjs'

/**
 * Consume the durable handoff pointer; failed or interrupted publications need explicit recovery.
 * @param root - selected daily checkout.
 * @param isRunning - whether its desktop shell is still running.
 * @returns the number of published bundles, or zero if there is nothing pending.
 */
export async function resumePromotion(root, isRunning) {
  const pointer = join(root, '.work/local-dev/pending-promotion.json')
  if (!existsSync(pointer)) return 0
  const { id } = JSON.parse(readFileSync(pointer, 'utf8'))
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/u.test(id)) throw new Error('Invalid daily handoff pointer')
  const directory = join(root, '.work/daily-updates', id)
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
  if (resolve(manifest.dailyRoot) !== resolve(root) || manifest.id !== id) throw new Error('Daily handoff belongs to another checkout')
  const state = JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8'))
  if (state.phase === 'applied') return 0
  if (!['prepared', 'waiting-for-exit'].includes(state.phase) || state.sourceApplied) {
    throw new Error('Daily update needs recovery; inspect ' + join(directory, 'status.json'))
  }
  return applyPreparedPromotion(directory, isRunning)
}

if (import.meta.main) {
  try {
    const count = await resumePromotion(resolve(process.argv[2] ?? '.'), isW1Running)
    if (count) console.log('W1 resumed reviewed update: ' + count + ' bundles')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
