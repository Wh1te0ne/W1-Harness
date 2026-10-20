// @vitest-environment jsdom
/** Fixed script tests in an isolated document, not the user's browser. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { pageOperation } from '../src/browser-page-script.ts'

beforeEach(() => {
  document.body.innerHTML = '<label for="name">Name</label><input id="name"><button>Save</button><input type="password" value="secret"><input type="file">'
  for (const element of document.querySelectorAll('body,label,button')) {
    Object.defineProperty(element, 'innerText', { value: element.textContent, configurable: true })
  }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30, toJSON: () => ({}) })
  vi.stubGlobal('w1BrowserSnapshot', undefined)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })
const read = (epoch = 's') => pageOperation({ action: 'read', epoch, maxTextChars: 100, maxElements: 10 })
const fill = (ref: string, text: string) => pageOperation({ action: 'fill', epoch: 'unused', maxTextChars: 100, maxElements: 10, ref, text })

it('reads bounded refs without exposing input values', () => {
  const snapshot = read()
  expect(JSON.stringify(snapshot)).not.toContain('secret')
  expect(snapshot).toHaveProperty('elements', expect.arrayContaining([expect.objectContaining({ ref: 's:1', tag: 'input', label: 'Name' })]))
})
it('fills literal text and emits input/change, then invalidates the old snapshot', () => {
  read()
  const input = document.querySelector('input')!
  const changed = vi.fn()
  input.addEventListener('input', changed)
  input.addEventListener('change', changed)
  fill('s:1', '"; globalThis.bad = true; //')
  expect(input.value).toBe('"; globalThis.bad = true; //')
  expect(changed).toHaveBeenCalledTimes(2)
  expect(() => fill('s:1', 'again')).toThrow('stale-element')
  expect(read('next')).toHaveProperty('elements', expect.arrayContaining([expect.objectContaining({ value: input.value })]))
})
it('rejects obsolete refs, detached controls, passwords and file fields', () => {
  read('old'); read('new')
  expect(() => fill('old:1', 'x')).toThrow('stale-element')
  expect(() => fill('new:3', 'x')).toThrow('sensitive-input')
  expect(() => fill('new:4', 'x')).toThrow('sensitive-input')
  document.querySelector('input')!.remove()
  expect(() => fill('new:1', 'x')).toThrow('stale-element')
})
it('rejects keyboard input while a password is focused', () => {
  document.querySelector<HTMLInputElement>('input[type=password]')!.focus()
  expect(() => pageOperation({ action: 'check-key', epoch: 'x', maxTextChars: 1, maxElements: 1 })).toThrow('sensitive-input')
})
