import { Context, FiberState, type Fiber } from '@deepseek-ai/cordis'
import type { Entry, EntryTree } from '@deepseek-ai/cordis-plugin-loader'

/** Startup wall-clock measurements; concurrent durations must not be added together. */
export interface StartupTiming {
  phase: 'import' | 'activate' | 'pending' | 'complete'
  name: string
  entry?: string
  elapsedMs: number
  durationMs: number
  waitMs?: number
  outcome: 'ready' | 'failed' | 'pending'
}

/** Keep local paths and URL credentials out of diagnostic labels. */
function label(value: string): string {
  return /^(?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)*$/.test(value) ? value : '[local module]'
}

/**
 * Observe imports, dependency waiting and activation until startup settles.
 * @param ctx - root context with Loader already mounted.
 * @param write - synchronous diagnostic sink; receives no configuration or error bodies.
 * @param now - monotonic milliseconds, injectable for deterministic measurements.
 * @returns an idempotent finish function that restores methods and removes listeners.
 */
export function installStartupTiming(
  ctx: Context,
  write: (record: StartupTiming) => void,
  now: () => number = () => performance.now(),
): (outcome?: 'ready' | 'failed') => void {
  const started = now()
  const imports = new Map<EntryTree, EntryTree['import']>()
  const entries = new Map<Entry, Entry['init']>()
  const fibers = new Map<Fiber, { created: number; loading?: number; ended?: boolean }>()
  let finished = false
  const emit = (record: Omit<StartupTiming, 'elapsedMs'>): void => {
    if (!finished) write({ ...record, elapsedMs: Math.round(now() - started) })
  }
  const identify = (fiber: Fiber): { name: string; entry?: string } => ({
    name: label(fiber.entry?.options.name ?? fiber.runtime?.name ?? 'anonymous'),
    ...fiber.entry === undefined ? {} : { entry: label(fiber.entry.options.id) },
  })
  const releases = [
    ctx.on('loader/entry-init', (entry) => {
      const originalInit: Entry['init'] = Reflect.get(entry, 'init')
      entries.set(entry, originalInit)
      entry.init = async function () {
        const tree = this.parent.tree
        if (!imports.has(tree)) {
          const originalImport: EntryTree['import'] = Reflect.get(tree, 'import')
          imports.set(tree, originalImport)
          tree.import = async function (name, getOuterStack) {
            const begin = now()
            let outcome: StartupTiming['outcome'] = 'failed'
            try {
              const value: unknown = await originalImport.call(this, name, getOuterStack)
              outcome = 'ready'
              return value
            } finally {
              emit({ phase: 'import', name: label(name), durationMs: Math.round(now() - begin), outcome })
            }
          }
        }
        return originalInit.call(this)
      }
    }, { global: true }),
    ctx.on('internal/plugin', (fiber) => {
      if (fiber.uid !== null && !fibers.has(fiber)) fibers.set(fiber, { created: now() })
    }, { global: true }),
    ctx.on('internal/status', (fiber) => {
      const row = fibers.get(fiber)
      if (row === undefined || row.ended) return
      if (fiber.state === FiberState.LOADING) row.loading ??= now()
      if (fiber.state !== FiberState.ACTIVE && fiber.state !== FiberState.FAILED) return
      row.ended = true
      emit({
        phase: 'activate', ...identify(fiber),
        durationMs: Math.round(now() - (row.loading ?? row.created)),
        waitMs: Math.round((row.loading ?? row.created) - row.created),
        outcome: fiber.state === FiberState.ACTIVE ? 'ready' : 'failed',
      })
    }, { global: true }),
  ]
  const finish = (outcome: 'ready' | 'failed' = 'ready'): void => {
    if (finished) return
    for (const [fiber, row] of fibers) {
      if (row.ended || fiber.state === FiberState.DISPOSED) continue
      emit({ phase: 'pending', ...identify(fiber), durationMs: Math.round(now() - row.created), outcome: 'pending' })
    }
    emit({ phase: 'complete', name: 'profile', durationMs: Math.round(now() - started), outcome })
    finished = true
    for (const release of releases) release()
    for (const [entry, original] of entries) entry.init = original
    for (const [tree, original] of imports) tree.import = original
    entries.clear()
    imports.clear()
    fibers.clear()
  }
  ctx.effect(() => () => { finish('failed') })
  return finish
}
