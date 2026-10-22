// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { AssistantChatData } from '../src/client/contract/chat-nodes.ts'
import type { ChatFlowSlotProps } from '../src/client/contract/slots.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { RunningStatus } from '../src/client/chat/RunningStatus.tsx'
import { zh } from '../src/client/locale.ts'

const t = makeTranslate(zh, commonZh)
const noOutput = ((_key: string, selector?: (value: undefined) => unknown) =>
  selector ? selector(undefined) : undefined) as ChatFlowSlotProps['useChatTurnAssistants']

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(5_000) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function statusHarness(startTime?: number) {
  const view = render(<RunningStatus turn={undefined} useChatTurnAssistants={noOutput} startTime={startTime} t={t} />)
  return {
    ...view,
    content: () => view.container.querySelector('[data-chat-running] > :last-child'),
    set: (nextStartTime?: number) => {
      view.rerender(<RunningStatus turn={undefined} useChatTurnAssistants={noOutput} startTime={nextStartTime} t={t} />)
    },
  }
}

describe('RunningStatus', () => {
  it('updates output from the stream, calibrates reported usage, and resets for a new turn', () => {
    const source = createSnapshotStore<readonly AssistantChatData[]>([])
    const useValue = bindSnapshotSelector(source)
    const useChatTurnAssistants = ((_key: string, selector?: (value: readonly AssistantChatData[] | undefined) => unknown) =>
      useValue(selector ?? (value => value))) as ChatFlowSlotProps['useChatTurnAssistants']
    const view = render(<RunningStatus turn={1} startTime={1_000} useChatTurnAssistants={useChatTurnAssistants} t={t} />)
    const label = () => view.container.querySelector('[data-live-output]')!
    expect(label().textContent).toBe('已生成 0 tokens')
    const message: AssistantChatData = { status: 'running', turn: 1, step: 1, time: 0,
      blocks: [{ kind: 'reasoning', text: 'thinking' }] }
    act(() => { source.set([message]) })
    expect(label().textContent).toBe('已生成 ≈6 tokens')
    act(() => { source.set([{ ...message, blocks: [{ kind: 'text', text: 'a longer streaming answer' }] }]) })
    expect(label().textContent).toBe('已生成 ≈11 tokens')
    act(() => { source.set([{ ...message, usage: { outputTokens: 10 } }]) })
    expect(label().textContent).toBe('已生成 10 tokens')
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(label().textContent).toBe('已生成 10 tokens')
    act(() => { source.set([]) })
    view.rerender(<RunningStatus turn={2} startTime={8_000} useChatTurnAssistants={useChatTurnAssistants} t={t} />)
    expect(label().textContent).toBe('已生成 0 tokens')
  })
  it('waits for an open Turn start before allocating its clock', () => {
    const view = statusHarness()
    expect(view.content()?.textContent).toBe('处理中')
    expect(vi.getTimerCount()).toBe(0)
    view.set(1_000)
    expect(view.content()?.textContent).toMatch(/^\d+秒 · 处理中/)
    expect(view.content()?.querySelectorAll('[data-shimmer="true"]')).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(1)
    view.set()
    expect(view.content()?.textContent).toBe('处理中')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the indicator mounted while a continuous run moves to the next Turn', () => {
    const view = statusHarness(1_000)
    const content = view.content()
    const status = view.getByRole('status')
    const initialText = content?.textContent
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(content?.textContent).toMatch(/^\d+秒 · 处理中/)
    expect(content?.textContent).not.toBe(initialText)
    view.set(7_000)
    expect(view.content()).toBe(content)
    expect(content?.textContent).toMatch(/^\d+秒 · 处理中/)
    expect(vi.getTimerCount()).toBe(1)
    const nextTurnText = content?.textContent
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(content?.textContent).toMatch(/^\d+秒 · 处理中/)
    expect(content?.textContent).not.toBe(nextTurnText)
    expect(view.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('处理中')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the duration nonnegative when the start is ahead of the local clock', () => {
    const view = statusHarness(6_000)
    expect(view.content()?.textContent).toMatch(/^\d+秒 · 处理中/)
    expect(view.content()?.textContent).not.toContain('-')
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(view.content()?.textContent).toMatch(/^\d+秒 · 处理中/)
    expect(view.content()?.textContent).not.toContain('-')
  })

})
