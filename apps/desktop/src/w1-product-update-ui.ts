/** W1 binary-update choices never invoke the DSH source upgrade workflow. */
import type { MessageBoxReturnValue } from 'electron'
import type { W1Product } from './w1-upstream.ts'
import type { DesktopUpdateCoordinator } from './update-coordinator.ts'
import type { DesktopUpdateState } from './ipc.ts'
import type { UpdateDialogOptions } from './update-dialog.ts'
import { renderReleaseNotes } from './release-notes.ts'
import { W1_RELEASES } from './w1-product-updates.ts'

const copy = {
  'zh-CN': { title: 'W1H 产品更新', current: 'W1H 当前版本', base: 'DSH 已整合基线', target: 'W1H 新版本',
    latest: '当前没有可用的 W1H 更新', failed: 'W1H 更新检查失败', retry: '请检查网络后重试。',
    available: '发现 W1H 新版本', notes: 'W1H 版本说明', download: '下载更新', later: '稍后', close: '关闭',
    releases: '查看发行版', install: '安装并重启', ready: '更新已下载并通过校验', busy: '正在准备 W1H 更新',
    source: '当前运行源码开发版。可查看和下载发行版；此入口不会覆盖开发源码。',
    testing: '当前运行隔离测试版。可查看发行版；请由开发工作区更新候选程序。',
    notice: '下载不会中断当前任务。安装时会再次确认任务状态并重启 W1H。',
    version: 'W1H {version}' },
  en: { title: 'W1H product updates', current: 'Current W1H version', base: 'Integrated DSH baseline', target: 'New W1H version',
    latest: 'No W1H update is available', failed: 'W1H update check failed', retry: 'Check your connection and try again.',
    available: 'A new W1H version is available', notes: 'W1H release notes', download: 'Download update', later: 'Later', close: 'Close',
    releases: 'View releases', install: 'Install and restart', ready: 'Update downloaded and verified', busy: 'Preparing the W1H update',
    source: 'This is a source development build. View and download releases without overwriting your checkout.',
    testing: 'This is an isolated test build. Review releases and update the candidate from your development checkout.',
    notice: 'Downloading keeps tasks running. Installation checks tasks again before restarting W1H.',
    version: 'W1H {version}' },
}

/** User-owned confirmation path; every returned index belongs to the currently displayed choices. */
export async function showW1ProductUpdate(options: {
  readonly product: W1Product
  readonly locale: 'zh-CN' | 'en'
  readonly source: boolean
  readonly testing?: boolean
  readonly check: () => Promise<DesktopUpdateState>
  readonly notes: () => string
  readonly updates: Pick<DesktopUpdateCoordinator, 'download' | 'install'>
  readonly show: (options: UpdateDialogOptions) => Promise<MessageBoxReturnValue>
  readonly openExternal: (url: string) => Promise<void>
}): Promise<void> {
  const { product, source, updates, show } = options
  const discoveryOnly = source || options.testing === true
  const t = copy[options.locale]
  let state = await options.check()
  const release = () => ({ versions: [{ label: t.current, value: product.version },
    ...state.version === undefined ? [] : [{ label: t.target, value: state.version }]],
  facts: [{ label: t.base, value: product.upstreamTag }], notes: { ...renderReleaseNotes(options.notes()), label: t.notes },
  notice: options.testing === true ? t.testing : source ? t.source : t.notice })
  if (state.phase === 'available' && state.version !== undefined) {
    const response = await show({ type: 'info', title: t.title, message: t.available, release: release(),
      buttons: [discoveryOnly ? t.releases : t.download, t.later], cancelId: 1, defaultId: 1 })
    if (response.response !== 0) return
    if (discoveryOnly) { await options.openExternal(W1_RELEASES); return }
    state = await updates.download(state.version)
  }
  if (!discoveryOnly && state.phase === 'ready' && state.version !== undefined) {
    const response = await show({ type: 'info', title: t.title, message: t.ready, release: release(),
      buttons: [t.install, t.later], cancelId: 1, defaultId: 1 })
    if (response.response === 0) await updates.install(state.version)
    return
  }
  await show({ type: state.phase === 'error' ? 'error' : 'info', title: t.title,
    message: state.phase === 'idle' ? t.latest : state.phase === 'error' ? t.failed : t.busy,
    ...state.phase === 'error' ? { detail: t.retry, ...state.message === undefined ? {} : { technicalDetails: state.message } } : {},
    release: release(), buttons: [t.close], cancelId: 0 })
}
