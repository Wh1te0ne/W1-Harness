import { expect, it, vi } from 'vitest'
const { writeText } = vi.hoisted(() => ({ writeText: vi.fn() }))
vi.mock('electron', () => ({ clipboard: { writeText } }))
import { manageW1Remote } from '../src/w1-remote-settings.ts'
it('rejects unknown actions before contacting the Host', async () => {
  const manage = vi.fn()
  await expect(manageW1Remote('execute', {}, manage)).rejects.toThrow('无效')
  expect(manage).not.toHaveBeenCalled()
})
it('returns pairing as an image and rejects expired copy requests', async () => {
  const manage = vi.fn(async () => ({ pairing: { url: 'w1h://pair?fixture=1' } }))
  const state = await manageW1Remote('status', undefined, manage)
  expect(state).toHaveProperty('qrDataUrl', expect.stringMatching(/^data:image\/svg\+xml;base64,/))
  await manageW1Remote('copy', undefined, manage)
  expect(writeText).toHaveBeenCalledWith('w1h://pair?fixture=1')
  await expect(manageW1Remote('copy', undefined, async () => ({ pairing: null }))).rejects.toThrow('已过期')
})
