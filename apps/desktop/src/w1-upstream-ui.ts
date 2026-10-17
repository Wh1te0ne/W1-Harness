/** W1 source-update dialog and development handoff, separate from binary installation. */
import { clipboard, shell, type MessageBoxReturnValue } from 'electron'
import type { UpdateDialogOptions } from './update-dialog.ts'
import { w1UpgradeTask, type W1UpstreamUpdates } from './w1-upstream.ts'

const copy = {
  'zh-CN': {
    title: 'DSH 上游更新', latest: '上游检查完成，暂无待跟进版本', pending: '发现上游新版本 · 待开发跟进',
    failed: '上游检查未完成，保留上次结果', current: 'W1 版本', base: '已整合上游', checked: '上次成功检查', never: '尚未成功检查',
    refresh: '重新检查', task: '复制升级任务', release: '查看发布说明', later: '稍后跟进', close: '关闭', next: '下一版本',
    notice: '仅提醒上游源码变化。由你在开发聊天中发起合并、验证和发布。', prerelease: '预发布', stable: '正式版',
    error: '检查失败，请检查网络后重试。', rate: 'GitHub 请求受限，请稍后重试。', storage: '无法读取提醒记录。请检查 W1 数据目录中的 upstream-releases.json；原文件已保留。',
    copied: '升级任务已复制', copiedDetail: '粘贴到开发聊天即可发起跟进。当前已整合基线没有改变。', acknowledge: '知道了',
  },
  en: {
    title: 'DSH upstream releases', latest: 'No pending upstream releases', pending: 'New upstream release · pending development',
    failed: 'Upstream check incomplete; previous results retained', current: 'W1 version', base: 'Integrated upstream', checked: 'Last successful check', never: 'Not checked successfully',
    refresh: 'Check again', task: 'Copy upgrade task', release: 'Release notes', later: 'Later', close: 'Close', next: 'Next release',
    notice: 'Source release notifications only. Start a development chat to merge, validate and publish W1.', prerelease: 'Prerelease', stable: 'Stable',
    error: 'Check failed. Check your connection and retry.', rate: 'GitHub rate limit reached. Retry later.', storage: 'Cannot read upstream-releases.json in W1 data. The original file was preserved.',
    copied: 'Upgrade task copied', copiedDetail: 'Paste it into your development chat. The integrated baseline has not changed.', acknowledge: 'OK',
  },
} as const

/**
 * Show retained pending releases and explicit read-only actions.
 * @param updates - Main-process release-state owner.
 * @param language - Current product locale.
 * @param show - Owned desktop dialog presentation.
 * @param manual - Refresh immediately when explicitly requested.
 * @returns after the user dismisses the dialog or copies a handoff.
 */
export async function showW1Upstream(updates: W1UpstreamUpdates, language: string,
  show: (options: UpdateDialogOptions) => Promise<MessageBoxReturnValue>, manual = false): Promise<void> {
  const t = language === 'zh-CN' ? copy['zh-CN'] : copy.en
  if (manual || updates.state.lastSuccess === null) await updates.check(true)
  let index = 0
  for (;;) {
    const state = updates.state
    const release = state.releases[index % Math.max(1, state.releases.length)]
    const detail = [`${t.current}: ${updates.product.version}`, `${t.base}: ${updates.product.upstreamTag}`,
      `${t.checked}: ${state.lastSuccess === null ? t.never : new Date(state.lastSuccess).toLocaleString(language)}`,
      state.error === null ? '' : state.error === 'rate-limit' ? t.rate : state.error === 'state-unavailable' ? t.storage : t.error,
      release === undefined ? '' : `${release.tag} · ${release.prerelease ? t.prerelease : t.stable} · ${release.publishedAt.slice(0, 10)} (${String(index + 1)}/${String(state.releases.length)})`,
      release?.body.slice(0, 1600) ?? '', t.notice].filter(Boolean).join('\n\n')
    if (release !== undefined) await updates.acknowledge(release.tag)
    const buttons = release === undefined ? [t.refresh, t.close]
      : [t.task, t.release, t.refresh, ...(state.releases.length > 1 ? [t.next] : []), t.later]
    const result = await show({ type: 'info', title: t.title,
      message: state.error !== null ? t.failed : release === undefined ? t.latest : t.pending,
      detail, buttons, cancelId: buttons.length - 1, defaultId: buttons.length - 1 })
    if (result.response === buttons.length - 1) {
      if (release !== undefined) await updates.acknowledge(release.tag, true)
      return
    }
    if (release === undefined || result.response === 2) { await updates.check(true); index = 0; continue }
    if (result.response === 0) {
      await clipboard.writeText(w1UpgradeTask(updates.product, release))
      await show({ type: 'info', title: t.title, message: t.copied, detail: t.copiedDetail, buttons: [t.acknowledge], cancelId: 0 })
      return
    }
    if (result.response === 1) { await shell.openExternal(release.url); return }
    index = (index + 1) % state.releases.length
  }
}
