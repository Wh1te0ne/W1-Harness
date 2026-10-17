import { describe, expect, it } from 'vitest'
import { retryWindowsFileAccess, retryWindowsFileAccessSync } from '../src/windows-file-access.ts'

describe('Windows packaging sharing violations', () => {
  it('retries the same synchronous file before advancing the inventory', () => {
    let attempts = 0
    expect(retryWindowsFileAccessSync(() => {
      if (attempts++ === 0) throw Object.assign(new Error('file held'), { code: 'EBUSY' })
      return 'same file verified'
    }, 'win32')).toBe('same file verified')
    expect(attempts).toBe(2)
  })
  it('retries a temporary sharing violation and returns the completed inventory', async () => {
    let attempts = 0
    const value = await retryWindowsFileAccess(() => {
      if (attempts++ === 0) throw Object.assign(new Error('scanner holds file'), { code: 'EBUSY' })
      return ['verified sha256']
    }, 'win32')
    expect(value).toEqual(['verified sha256'])
    expect(attempts).toBe(2)
  })
  it('retains the original error after the bounded retry budget', async () => {
    let attempts = 0
    const error = Object.assign(new Error('still locked'), { code: 'EPERM' })
    await expect(retryWindowsFileAccess(() => { attempts++; throw error }, 'win32')).rejects.toBe(error)
    expect(attempts).toBe(5)
  })
  it('does not retry missing files, integrity failures or non-Windows errors', async () => {
    for (const [code, platform] of [['ENOENT', 'win32'], ['integrity', 'win32'], ['EBUSY', 'linux']] as const) {
      let attempts = 0
      const error = Object.assign(new Error('failed'), { code })
      await expect(retryWindowsFileAccess(() => { attempts++; throw error }, platform)).rejects.toBe(error)
      expect(attempts).toBe(1)
    }
  })
})
