// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createW1Appearance, validateAppearance, W1_DEFAULT } from '../src/client/w1-appearance.ts'
import { W1AppearanceControls } from '../src/client/W1Appearance.tsx'
import { W1_PRESETS } from '../src/client/w1-presets.ts'
const controllers: ReturnType<typeof createW1Appearance>[] = []
afterEach(() => {
  cleanup(); controllers.splice(0).forEach(c => c.dispose()); localStorage.clear(); vi.useRealTimers()
})
function setup() {
  const theme = { overrideTokens: vi.fn(() => vi.fn()) }
  const controller = createW1Appearance(theme)
  controllers.push(controller)
  return { theme, controller }
}
it('restores an unsafe-looking CSS preview automatically and never persists before confirmation', () => {
  vi.useFakeTimers()
  const { controller } = setup()
  controller.preview({ ...W1_DEFAULT, css: 'body { display: none }' })
  expect(document.querySelector('[data-w1-appearance]')?.textContent).toContain('display: none')
  expect(localStorage.getItem('w1.appearance.v1')).toBeNull()
  vi.advanceTimersByTime(20_000)
  expect(document.querySelector('[data-w1-appearance]')?.textContent).toBe('')
  expect(controller.getSnapshot().previewing).toBe(false)
})
it('saves both palette modes only after explicit preview confirmation and restores them after remount', () => {
  const { controller, theme } = setup()
  render(<W1AppearanceControls controller={controller} />)
  fireEvent.change(screen.getByRole('combobox', { name: '主题' }), { target: { value: 'absolutely' } })
  fireEvent.click(screen.getByRole('button', { name: '预览外观' }))
  expect(theme.overrideTokens).toHaveBeenLastCalledWith('w1-appearance', expect.objectContaining({ '--dsw-alias-bg-base': { light: '#f9f9f7', dark: '#2d2d2b' } }))
  fireEvent.click(screen.getByRole('button', { name: '保存外观' }))
  expect(controller.getSnapshot().saved.preset).toBe('absolutely')
  const second = setup()
  expect(second.controller.getSnapshot().saved).toEqual(controller.getSnapshot().saved)
  act(() => { second.controller.reset() })
  expect(second.controller.getSnapshot().saved).toEqual(W1_DEFAULT)
})
it('rejects malformed imports and external-resource CSS while accepting every recovered palette', () => {
  for (const preset of W1_PRESETS) expect(validateAppearance({ preset: preset.id, light: preset.light, dark: preset.dark, css: '' }).preset).toBe(preset.id)
  expect(() => validateAppearance({ ...W1_DEFAULT, light: { ...W1_DEFAULT.light, accent: 'red' } })).toThrow('#RRGGBB')
  expect(() => validateAppearance({ ...W1_DEFAULT, css: '@import "https://example.test/style.css"' })).toThrow('@import')
})
it('removes its CSS and token override when unloaded, including during a preview', () => {
  vi.useFakeTimers()
  const retract = vi.fn()
  const controller = createW1Appearance({ overrideTokens: () => retract })
  controller.preview({ ...W1_DEFAULT, css: 'body { --test: 1 }' })
  controller.dispose()
  expect(document.querySelector('[data-w1-appearance]')).toBeNull()
  expect(retract).toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels a preview when its draft is edited so saving cannot confirm stale colors', () => {
  const { controller } = setup()
  render(<W1AppearanceControls controller={controller} />)
  fireEvent.click(screen.getByRole('button', { name: '预览外观' }))
  expect(screen.getByRole('button', { name: '保存外观' })).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: '强调色色值' }), { target: { value: '#123456' } })
  expect(screen.queryByRole('button', { name: '保存外观' })).toBeNull()
  expect(controller.getSnapshot().previewing).toBe(false)
  expect(localStorage.getItem('w1.appearance.v1')).toBeNull()
})
