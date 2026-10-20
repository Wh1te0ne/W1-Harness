/** Preserve Electron fuse settings while retrying transient Windows file sharing violations. */
import { setTimeout } from 'node:timers/promises'

/**
 * @template T
 * @param {() => Promise<T>} operation - One idempotent fuse write owned by electron-builder.
 * @param {NodeJS.Platform} platform - Build host platform.
 * @param {(milliseconds: number) => Promise<unknown>} pause - Delay boundary for deterministic tests.
 * @returns {Promise<T>} The original result, or the final original failure.
 */
export async function retryWindowsFuses(operation, platform = process.platform, pause = setTimeout) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation() }
    catch (error) {
      if (platform !== 'win32' || attempt >= 7 || !(error instanceof Error) || !('code' in error)
        || error.code !== 'EBUSY' && error.code !== 'EPERM') throw error
      await pause(500 * (attempt + 1))
    }
  }
}
