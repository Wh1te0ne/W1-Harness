// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { browserFocusOperation } from '../src/browser-focus.ts'

it('keeps the latest user editor focused while concurrent guest inputs run, then removes the guard', () => {
  document.body.innerHTML = '<textarea id="chat"></textarea><input id="other"><webview tabindex="0"></webview>'
  const chat = document.getElementById('chat') as HTMLTextAreaElement
  const other = document.getElementById('other') as HTMLInputElement
  const guest = document.querySelector('webview') as HTMLElement
  chat.value = 'draft'
  chat.focus()
  chat.setSelectionRange(2, 2)
  browserFocusOperation('a', true)
  browserFocusOperation('b', true)
  guest.focus()
  expect(document.activeElement).toBe(chat)
  expect(chat.selectionStart).toBe(2)
  other.focus()
  browserFocusOperation('a', false)
  guest.focus()
  expect(document.activeElement).toBe(other)
  browserFocusOperation('b', false)
  guest.focus()
  expect(document.activeElement).toBe(guest)
  document.body.innerHTML = ''
})
