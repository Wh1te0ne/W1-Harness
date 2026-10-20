import { expect, it, vi } from 'vitest'
import { retryWindowsFuses } from '../scripts/windows-fuse-retry.mjs'

it('retries a Windows sharing violation and preserves the fuse operation result', async () => {
  const locked = Object.assign(new Error('locked'), { code: 'EBUSY' })
  const write = vi.fn<() => Promise<string>>().mockRejectedValueOnce(locked).mockResolvedValue('written')
  const pause = vi.fn(async () => {})
  expect(await retryWindowsFuses(write, 'win32', pause)).toBe('written')
  expect(write).toHaveBeenCalledTimes(2)
  expect(pause).toHaveBeenCalledWith(500)
})

it('retains the final error after the bounded Windows retry sequence', async () => {
  const locked = Object.assign(new Error('locked'), { code: 'EPERM' })
  const write = vi.fn(async () => { throw locked })
  const pause = vi.fn(async () => {})
  await expect(retryWindowsFuses(write, 'win32', pause)).rejects.toBe(locked)
  expect(write).toHaveBeenCalledTimes(8)
  expect(pause).toHaveBeenCalledTimes(7)
})

it.each(['linux', 'darwin'] as const)('does not retry sharing errors on %s', async (platform) => {
  const locked = Object.assign(new Error('locked'), { code: 'EBUSY' })
  const write = vi.fn(async () => { throw locked }), pause = vi.fn(async () => {})
  await expect(retryWindowsFuses(write, platform, pause)).rejects.toBe(locked)
  expect(write).toHaveBeenCalledTimes(1)
  expect(pause).not.toHaveBeenCalled()
})

it('does not retry malformed fuse data or unrelated I/O failures', async () => {
  const invalid = Object.assign(new Error('invalid fuse wire'), { code: 'EINVAL' })
  const write = vi.fn(async () => { throw invalid }), pause = vi.fn(async () => {})
  await expect(retryWindowsFuses(write, 'win32', pause)).rejects.toBe(invalid)
  expect(write).toHaveBeenCalledTimes(1)
  expect(pause).not.toHaveBeenCalled()
})
