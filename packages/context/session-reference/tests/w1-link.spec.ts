import { describe, expect, it } from 'vitest'
import { encodeSessionLink, decodeSessionLink } from '../src/link.ts'
import { parseSessionReferenceText } from '../src/uri.ts'

describe('W1 conversation links', () => {
  it.each(['plain-id', '中文 / % # ? (test).', 'with\nnewline'])('round trips opaque IDs: %s', (id) => {
    expect(decodeSessionLink(encodeSessionLink(id, 'w1-harness'), 'w1-harness')).toBe(id)
  })
  it('rejects another environment and noncanonical URL fields', () => {
    for (const link of ['w1-harness-test://session/a', 'dsh://session/a', 'w1-harness://session/a?cwd=x', 'w1-harness://session/a#x', 'w1-harness://session/', 'w1-harness://session/%zz']) {
      expect(() => decodeSessionLink(link, 'w1-harness')).toThrow()
    }
  })
  it('resolves links in direct text including Chinese punctuation, and stays opt-in', () => {
    const link = encodeSessionLink('source', 'w1-harness')
    const text = `请参考 ${link}。继续。`
    expect(parseSessionReferenceText(text).references).toEqual([])
    expect(parseSessionReferenceText(text, 'w1-harness')).toEqual({ text: '请参考 @source。继续。', references: [{ sessionId: 'source', label: 'source' }] })
    expect(parseSessionReferenceText(`${link}.`, 'w1-harness').references).toHaveLength(1)
    expect(() => parseSessionReferenceText(link, 'w1-harness-test')).toThrow()
  })
})
