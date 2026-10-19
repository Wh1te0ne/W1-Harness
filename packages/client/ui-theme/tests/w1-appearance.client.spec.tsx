// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createW1Appearance, validateAppearance, W1_DEFAULT } from '../src/client/w1-appearance.ts'
import { W1AppearanceControls } from '../src/client/W1Appearance.tsx'
import { W1_PRESETS } from '../src/client/w1-presets.ts'
const controllers: ReturnType<typeof createW1Appearance>[] = []
const saved = () => JSON.parse(localStorage.getItem('w1.appearance.v1') ?? 'null')
afterEach(() => {
  cleanup(); controllers.splice(0).forEach(c => c.dispose()); localStorage.clear()
})
function setup(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const theme = { overrideTokens: vi.fn(() => vi.fn()) }
  const controller = createW1Appearance(theme, storage)
  controllers.push(controller)
  return { theme, controller }
}
it('applies and persists a selected theme immediately and restores it after remount', () => {
  const { controller, theme } = setup()
  render(<W1AppearanceControls controller={controller} />)
  fireEvent.change(screen.getByRole('combobox', { name: '主题' }), { target: { value: 'absolutely' } })
  expect(theme.overrideTokens).toHaveBeenLastCalledWith('w1-appearance', expect.objectContaining({ '--dsw-alias-bg-base': { light: '#f9f9f7', dark: '#2d2d2b' } }))
  expect(saved().preset).toBe('absolutely')
  expect(screen.queryByRole('button', { name: '保存外观' })).toBeNull()
  expect(screen.queryByRole('button', { name: '预览外观' })).toBeNull()
  const second = setup()
  expect(second.controller.getSnapshot().saved).toEqual(controller.getSnapshot().saved)
  act(() => { second.controller.reset() })
  expect(saved()).toEqual(W1_DEFAULT)
})
it('retains the last applied palette while a hex value is incomplete and applies the completed edit', () => {
  const { controller, theme } = setup()
  render(<W1AppearanceControls controller={controller} />)
  const field = screen.getByRole('textbox', { name: '强调色色值' })
  fireEvent.change(field, { target: { value: '#123456' } })
  expect(saved().light.accent).toBe('#123456')
  const calls = theme.overrideTokens.mock.calls.length
  fireEvent.change(field, { target: { value: '#123' } })
  expect(saved().light.accent).toBe('#123456')
  expect(theme.overrideTokens).toHaveBeenCalledTimes(calls)
  fireEvent.blur(field)
  expect(screen.getByRole('alert').textContent).toContain('#RRGGBB')
  fireEvent.change(field, { target: { value: '#abcdef' } })
  expect(saved().light.accent).toBe('#abcdef')
  fireEvent.click(screen.getByRole('button', { name: '深色' }))
  fireEvent.change(screen.getByLabelText('背景选择器'), { target: { value: '#112233' } })
  expect(saved().dark.surface).toBe('#112233')
  expect(saved().light.accent).toBe('#abcdef')
})
it('applies CSS as it is edited and preserves the last valid CSS when external resources are rejected', () => {
  const { controller } = setup()
  render(<W1AppearanceControls controller={controller} />)
  fireEvent.click(screen.getByText('高级 · 自定义 CSS'))
  const field = screen.getByRole('textbox', { name: '自定义 CSS' })
  const css = 'body { --test: 1 }'
  fireEvent.change(field, { target: { value: css } })
  expect(document.querySelector('[data-w1-appearance]')?.textContent).toBe(css)
  expect(saved().css).toBe(css)
  fireEvent.change(field, { target: { value: '@import "https://example.test/style.css"' } })
  expect(screen.getByRole('alert').textContent).toContain('@import')
  expect(saved().css).toBe(css)
  expect(document.querySelector('[data-w1-appearance]')?.textContent).toBe(css)
  fireEvent.click(screen.getByRole('button', { name: '恢复默认' }))
  expect(saved()).toEqual(W1_DEFAULT)
  expect(document.querySelector('[data-w1-appearance]')?.textContent).toBe('')
})
it('reports a persistence failure without claiming success or applying an unsaved theme', () => {
  const { controller, theme } = setup({ getItem: () => null, setItem: () => { throw new Error('Storage is full') } })
  render(<W1AppearanceControls controller={controller} />)
  fireEvent.change(screen.getByRole('combobox', { name: '主题' }), { target: { value: 'absolutely' } })
  expect(screen.getByRole('alert').textContent).toBe('Storage is full')
  expect(controller.getSnapshot().saved).toEqual(W1_DEFAULT)
  expect(theme.overrideTokens).toHaveBeenCalledTimes(1)
})
it('rejects malformed imports while accepting every recovered palette', () => {
  for (const preset of W1_PRESETS) expect(validateAppearance({ preset: preset.id, light: preset.light, dark: preset.dark, css: '' }).preset).toBe(preset.id)
  expect(() => validateAppearance({ ...W1_DEFAULT, light: { ...W1_DEFAULT.light, accent: 'red' } })).toThrow('#RRGGBB')
})
it('removes its CSS and token override when unloaded without deleting saved preferences', () => {
  const retract = vi.fn()
  const controller = createW1Appearance({ overrideTokens: () => retract })
  controller.update({ ...W1_DEFAULT, css: 'body { --test: 1 }' })
  controller.dispose()
  expect(document.querySelector('[data-w1-appearance]')).toBeNull()
  expect(retract).toHaveBeenCalled()
  expect(saved().css).toContain('--test')
})
