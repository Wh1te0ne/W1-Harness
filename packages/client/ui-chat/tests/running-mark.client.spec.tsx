// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunningMark } from '../src/client/chat/RunningMark.tsx'

afterEach(cleanup)

describe('RunningMark', () => {
  it('keeps the activity artwork decorative and follows the current theme color', () => {
    const view = render(<RunningMark />)
    const mark = view.container.querySelector('svg')!
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.getAttribute('fill')).toBe('currentColor')
    expect(mark.hasAttribute('style')).toBe(false)
    expect(view.queryByRole('status')).toBeNull()
  })
})
