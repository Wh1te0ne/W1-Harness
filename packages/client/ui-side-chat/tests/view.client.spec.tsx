// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SideChat, type SideProps } from '../src/client/SideChat.tsx'
import type { SideState } from '../src/client/model.ts'
import { zh } from '../src/client/locales.ts'
import { ModelSelect } from '../../ui-model-selection/src/client/ModelSelect.tsx'
import { zh as modelZh } from '../../ui-model-selection/src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ModelPickerOwner } from '@deepseek-ai/dsh-client-ui-model-selection/client'

afterEach(cleanup)
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn() })
function props() {
  const state: SideState = { messages: [], draft: '这句话尚未发送', phase: 'idle', error: null, route: { provider: 'mock', model: 'main' },
    contextMessages: 3, catalog: { default: { provider: 'mock', model: 'main' }, groups: [{ id: 'mock', name: 'Mock', models: [{ id: 'main', name: 'Main' }] }], failures: [], routableProviders: ['mock'] },
    catalogError: null, closeRequested: false, usage: null }
  const actions = { send: vi.fn(), stop: vi.fn(), model: vi.fn(), draft: vi.fn(),
    loadCatalog: vi.fn(), cancelClose: vi.fn(), confirmClose: vi.fn() }
  const value: Partial<SideProps> = {
    useTabInfo: (() => ({ tab: { id: 'tab-a' } })) as SideProps['useTabInfo'], useSideChat: () => state, actionsFor: () => actions,
    newChat: vi.fn(), t: (key: string) => zh[key as keyof typeof zh] ?? key,
    renderFactorySlot: (name, input) => {
      expect(name).toBe('model.selector')
      return <ModelSelect {...input as ModelPickerOwner} renderSlot={(_name, _owner, options) => options?.fallback ?? null}
        t={(key, values) => {
          const template = (modelZh as Record<string, string>)[key] ?? (commonZh as Record<string, string>)[key] ?? key
          return Object.entries(values ?? {}).reduce((text, [name, value]) => text.replaceAll('{' + name + '}', String(value)), template)
        }} />
    },
  }
  return { state, actions, value: value as SideProps }
}
describe('side chat input', () => {
  it('holds IME and modified Enter, sends plain Enter and always references context without a checkbox', () => {
    const p = props(); const view = render(<SideChat {...p.value} />)
    expect(view.getByRole('button', { name: /^选择模型/ })).toBeTruthy()
    const input = view.getByRole('textbox')
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(p.actions.send).not.toHaveBeenCalled()
    fireEvent.keyUp(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(p.actions.send).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(p.actions.send).toHaveBeenCalledOnce()
    expect(view.queryByRole('checkbox')).toBeNull()
  })
  it('renders a running side response and routes Stop solely to its injected owner', () => {
    const p = props()
    p.value.useSideChat = (() => ({ ...p.state, phase: 'running', messages: [{ id: 1, role: 'assistant', text: 'Side answer' }] })) as SideProps['useSideChat']
    const view = render(<SideChat {...p.value} />)
    expect(view.getByText('Side answer')).toBeTruthy()
    expect((view.getByRole('button', { name: /^选择模型/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(view.getByRole('button', { name: '停止侧边回复' }))
    expect(p.actions.stop).toHaveBeenCalledOnce()
    expect(p.actions.send).not.toHaveBeenCalled()
  })
  it('shows the temporary-chat confirmation and routes Cancel, Escape and Confirm to its owner', () => {
    const p = props()
    p.value.useSideChat = () => ({ ...p.state, closeRequested: true })
    const view = render(<SideChat {...p.value} />)
    expect(view.getByRole('dialog', { name: '关闭侧边聊天？' })).toBeTruthy()
    expect(view.getByText('这个侧边聊天将被删除，且无法恢复。你确定吗？')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '取消' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(p.actions.cancelClose).toHaveBeenCalledTimes(2)
    expect(p.actions.confirmClose).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: '关闭侧边聊天' }))
    expect(p.actions.confirmClose).toHaveBeenCalledOnce()
  })
  it('opens the shared model menu and offers a catalog retry while keeping the composer', () => {
    const p = props()
    p.value.useSideChat = () => ({ ...p.state, catalog: null, catalogError: 'offline' })
    const view = render(<SideChat {...p.value} />)
    fireEvent.click(view.getByRole('button', { name: '请选择模型' }))
    fireEvent.click(view.getByRole('button', { name: '重试' }))
    expect(p.actions.loadCatalog).toHaveBeenCalledTimes(2)
    expect(view.getByRole('textbox')).toBeTruthy()
    expect(view.getByRole('group', { name: '模型与推理等级' })).toBeTruthy()
  })
  it('uses the main picker search and effort panes with side-owned selection callbacks', async () => {
    const p = props()
    const catalog = {
      default: p.state.route!, routableProviders: ['mock', 'other'], failures: [], groups: [
        { id: 'mock', name: 'Main provider', models: [{ id: 'main', name: 'Main', reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'max', name: 'Max' }], defaultEffort: 'high' } }] },
        { id: 'other', name: 'Other provider', models: Array.from({ length: 5 }, (_, index) => ({ id: 'model-' + String(index), name: 'Other ' + String(index) })) },
      ],
    }
    p.value.useSideChat = () => ({ ...p.state, catalog })
    const view = render(<SideChat {...p.value} />)
    const trigger = view.getByRole('button', { name: /^选择模型/ })
    fireEvent.click(trigger)
    fireEvent.click(view.getByRole('menuitem', { name: /^推理等级/ }))
    fireEvent.click(view.getByRole('menuitemradio', { name: 'Max' }))
    await waitFor(() => { expect(p.actions.model).toHaveBeenCalledWith({ provider: 'mock', model: 'main', reasoningEffort: 'max' }) })
    await waitFor(() => { expect(view.queryByRole('menu')).toBeNull() })
    fireEvent.click(trigger)
    fireEvent.click(view.getByRole('menuitem', { name: /^模型/ }))
    fireEvent.change(view.getByPlaceholderText('搜索模型…'), { target: { value: 'Other 3' } })
    expect(view.getAllByRole('menuitemradio')).toHaveLength(1)
    fireEvent.click(view.getByRole('menuitemradio', { name: 'Other 3' }))
    await waitFor(() => { expect(p.actions.model).toHaveBeenLastCalledWith({ provider: 'other', model: 'model-3' }) })
  })
})
