/** W1 source-update dialog and development handoff, separate from binary installation. */
import { clipboard, shell, type MessageBoxReturnValue } from 'electron'
import type { UpdateDialogOptions } from './update-dialog.ts'
import { w1UpgradeTask, type W1UpstreamUpdates } from './w1-upstream.ts'
import { renderReleaseNotes } from './release-notes.ts'

const copy = {
  'zh-CN': {
    title: 'DSH 上游更新', latest: '上游检查完成，暂无待跟进版本', pending: '发现上游新版本 · 待开发跟进',
    failed: '上游检查未完成，保留上次结果', current: 'W1 版本', base: '当前基线 · 已整合', checked: '上次成功检查', never: '尚未成功检查',
    available: '新版本 · 待跟进', none: '暂无待跟进版本', published: '新版本发布时间', basePublished: '基线发布时间', notes: '发布说明',
    refresh: '重新检查', task: '复制升级任务', release: '查看发布说明', later: '稍后跟进', close: '关闭', next: '下一版本',
    notice: '仅提醒上游源码变化。由你在开发聊天中发起合并、验证和发布。', prerelease: '预发布', stable: '正式版',
    error: '检查失败，请检查网络后重试。', rate: 'GitHub 请求受限，请稍后重试。', storage: '无法读取提醒记录。请检查 W1 数据目录中的 upstream-releases.json；原文件已保留。',
    copied: '升级任务已复制', copiedDetail: '粘贴到开发聊天即可发起跟进。当前已整合基线没有改变。', acknowledge: '知道了',
  },
  en: {
    title: 'DSH upstream releases', latest: 'No pending upstream releases', pending: 'New upstream release · pending development',
    failed: 'Upstream check incomplete; previous results retained', current: 'W1 version', base: 'Current baseline · integrated', checked: 'Last successful check', never: 'Not checked successfully',
    available: 'New release · pending', none: 'No pending release', published: 'New release published', basePublished: 'Baseline published', notes: 'Release notes',
    refresh: 'Check again', task: 'Copy upgrade task', release: 'Release notes', later: 'Later', close: 'Close', next: 'Next release',
    notice: 'Source release notifications only. Start a development chat to merge, validate and publish W1.', prerelease: 'Prerelease', stable: 'Stable',
    error: 'Check failed. Check your connection and retry.', rate: 'GitHub rate limit reached. Retry later.', storage: 'Cannot read upstream-releases.json in W1 data. The original file was preserved.',
    copied: 'Upgrade task copied', copiedDetail: 'Paste it into your development chat. The integrated baseline has not changed.', acknowledge: 'OK',
  },
} as const

/**
 * Format a release instant in the desktop's local time zone, including the UTC offset.
 * @param instant - Valid ISO release or check timestamp.
 * @param language - Current product locale.
 * @returns Local date, time and explicit zone offset.
 */
export function formatW1ReleaseTime(instant: string, language: string): string {
  const parts = new Intl.DateTimeFormat(language, { year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(new Date(instant))
  const local = parts.filter(part => part.type !== 'timeZoneName').map(part => part.value).join('').replace(/\s+/gu, ' ').trim()
  const zone = parts.filter(part => part.type === 'timeZoneName').map(part => part.value).join('')
  return `${local} (${zone})`
}

/**
 * Show retained pending releases and explicit read-only actions.
 * @param updates - Main-process release-state owner.
 * @param language - Current product locale.
 * @param show - Owned desktop dialog presentation.
 * @param manual - Refresh immediately when explicitly requested.
 * @returns after the user dismisses the dialog or copies a handoff.
 */
export async function showW1Upstream(updates: Pick<W1UpstreamUpdates, 'product' | 'state' | 'check' | 'acknowledge'>, language: string,
  show: (options: UpdateDialogOptions) => Promise<MessageBoxReturnValue>, manual = false): Promise<void> {
  const t = language === 'zh-CN' ? copy['zh-CN'] : copy.en
  if (manual || updates.state.lastSuccess === null) await updates.check(true)
  let index = 0
  for (;;) {
    const state = updates.state
    const release = state.releases[index % Math.max(1, state.releases.length)]
    const detail = state.error === null ? '' : state.error === 'rate-limit' ? t.rate : state.error === 'state-unavailable' ? t.storage : t.error
    const releaseInfo = {
      versions: [
        { label: t.base, value: updates.product.upstreamTag },
        { label: t.available, value: release === undefined ? t.none : `${release.tag} · ${release.prerelease ? t.prerelease : t.stable}` },
      ],
      facts: [
        { label: t.current, value: updates.product.version },
        { label: release === undefined ? t.basePublished : t.published,
          value: formatW1ReleaseTime(release?.publishedAt ?? updates.product.upstreamPublishedAt, language) },
        { label: t.checked, value: state.lastSuccess === null ? t.never : formatW1ReleaseTime(state.lastSuccess, language) },
      ],
      ...(release === undefined ? {} : { notes: { ...renderReleaseNotes(release.body),
        label: state.releases.length > 1 ? `${t.notes} (${String(index + 1)}/${String(state.releases.length)})` : t.notes } }),
      notice: t.notice,
    }
    if (release !== undefined) await updates.acknowledge(release.tag)
    const buttons = release === undefined ? [t.refresh, t.close]
      : [t.task, t.release, t.refresh, ...(state.releases.length > 1 ? [t.next] : []), t.later]
    const result = await show({ type: 'info', title: t.title,
      message: state.error !== null ? t.failed : release === undefined ? t.latest : t.pending,
      detail, release: releaseInfo, buttons, cancelId: buttons.length - 1, defaultId: buttons.length - 1 })
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
