import { expect, it, vi } from 'vitest'
import { W1SessionLinks } from '../src/w1-session-links.ts'

it('retains cold-start navigation until matching acknowledgement and isolates Test', () => {
  const notify = vi.fn()
  const links = new W1SessionLinks('w1-harness-test', notify)
  expect(links.accept('w1-harness://session/same-id')).toBe(false)
  expect(links.accept(links.create('first'))).toBe(true)
  expect(links.peek()).toBe('first')
  expect(links.accept(links.create('second'))).toBe(true)
  links.acknowledge('first')
  expect(links.peek()).toBe('second')
  expect(links.resolve(links.create('target'))).toBe('target')
  expect(links.peek()).toBe('second')
  links.acknowledge('second')
  expect(links.peek()).toBeNull()
  expect(notify).toHaveBeenCalledTimes(2)
})
