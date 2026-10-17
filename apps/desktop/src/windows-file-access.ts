/** Bounded retry of transient Windows sharing violations, preserving the final original error. */
import { setTimeout } from 'node:timers/promises'

function retryable(error: unknown, attempt: number, platform: NodeJS.Platform): boolean {
  return platform === 'win32' && attempt < 4 && error instanceof Error && 'code' in error
    && (error.code === 'EBUSY' || error.code === 'EPERM')
}

/**
 * Retry one asynchronous file operation without changing its result or integrity checks.
 * @param operation - One file access, not a whole directory traversal.
 * @param platform - Host platform; other platforms never retry.
 * @returns The successful result, or the final original error after five attempts.
 */
export async function retryWindowsFileAccess<T>(operation: () => T | Promise<T>, platform: NodeJS.Platform = process.platform): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation() }
    catch (error) {
      if (!retryable(error, attempt, platform)) throw error
      await setTimeout(250 * (attempt + 1))
    }
  }
}

/**
 * Retry one synchronous packaging read while keeping directory inventories synchronous.
 * @param operation - One file read.
 * @param platform - Host platform; other platforms never retry.
 * @returns The successful result, or the final original error; waits total at most 2.5 seconds per file.
 */
export function retryWindowsFileAccessSync<T>(operation: () => T, platform: NodeJS.Platform = process.platform): T {
  for (let attempt = 0; ; attempt++) {
    try { return operation() }
    catch (error) {
      if (!retryable(error, attempt, platform)) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * (attempt + 1))
    }
  }
}
