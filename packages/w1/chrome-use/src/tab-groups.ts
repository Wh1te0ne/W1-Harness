/** Visible grouping for pages actually used by W1, without changing the foreground tab. */
import type { ChromeApi } from './extension-api.ts'

export class ChromeTabGroups {
  private readonly pending = new Map<number, Promise<void>>()
  constructor(private readonly api: ChromeApi) {}

  /** @param id - Owned target tab. @param signal - Current operation. @returns after the page belongs to its window's W1 group. */
  async include(id: number, signal: AbortSignal): Promise<void> {
    const tab = await this.api.tabs.get(id)
    signal.throwIfAborted()
    if (tab.windowId === undefined) throw new Error('Chrome window unavailable. List tabs again.')
    if (tab.pinned) throw new Error('Pinned tabs cannot join the W1 group. Ask the user to unpin this tab or open a separate page.')
    const windowId = tab.windowId
    const previous = this.pending.get(windowId) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(async () => {
      signal.throwIfAborted()
      const groups = await this.api.tabGroups.query({ title: 'W1', windowId })
      signal.throwIfAborted()
      const current = await this.api.tabs.get(id)
      signal.throwIfAborted()
      if (current.windowId !== windowId || current.pinned) throw new Error('Chrome tab moved or was pinned while grouping; list tabs again.')
      const existing = groups[0]
      if (existing && current.groupId === existing.id) return
      const group = await this.api.tabs.group({ tabIds: [id],
        ...existing ? { groupId: existing.id } : { createProperties: { windowId } } })
      await this.api.tabGroups.update(group, { ...existing ? {} : { title: 'W1', color: 'blue' }, collapsed: false })
    }).finally(() => { if (this.pending.get(windowId) === operation) this.pending.delete(windowId) })
    this.pending.set(windowId, operation)
    await operation
    signal.throwIfAborted()
  }
}
