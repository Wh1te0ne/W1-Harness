import { useState, useSyncExternalStore } from 'react'
import type { PropsRenderSlots, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { W1AppearanceController, W1Appearance, W1Palette } from './w1-appearance.ts'
import { W1_DEFAULT, validateAppearance } from './w1-appearance.ts'
import { W1_PRESETS } from './w1-presets.ts'
import css from './W1Appearance.module.css'

/** Render the feature-owned Appearance page and its registered settings rows. */
export function W1AppearanceSection({ renderSlot, t }: PropsRenderSlots<'settings.appearance.item'> & PropsLocale<'settings.theme'>) {
  return <section className={css.page}><h2>{t('appearance.title')}</h2><p className={css.description}>调整主题、配色与字体，让 W1 更适合你的工作方式。</p>{renderSlot('settings.appearance.item', {})}</section>
}
/** Valid edits apply and persist immediately; incomplete color text remains an editable draft. */
export function W1AppearanceControls({ controller }: { controller: W1AppearanceController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [draft, setDraft] = useState<W1Appearance>(() => structuredClone(state.saved))
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  const [error, setError] = useState('')
  const colors = draft[mode]
  const updateDraft = (value: W1Appearance) => {
    setDraft(value)
    setError('')
    if (![value.light, value.dark].every(palette => Object.values(palette).every(color => /^#[\da-f]{6}$/iu.test(color)))) return
    try { controller.update(value) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const change = (key: keyof W1Palette, value: string) => { updateDraft({ ...draft, preset: 'custom', [mode]: { ...colors, [key]: value } }) }
  const choose = (id: string) => {
    const selected = id === 'w1' ? W1_DEFAULT : W1_PRESETS.find(p => p.id === id)
    if (selected) updateDraft({ preset: id, light: { ...selected.light }, dark: { ...selected.dark }, css: draft.css })
  }
  const attempt = (operation: () => void) => { try { operation(); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } }
  const exportTheme = () => {
    attempt(() => {
      const value = validateAppearance(draft)
      const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'w1-theme.json'; a.click(); URL.revokeObjectURL(url)
    })
  }
  return <div className={css.customization}>
    <div className={css.card}>
      <label className={css.row}><span>主题</span><select aria-label="主题" value={draft.preset} onChange={(event) => { choose(event.target.value) }}>
        <option value="w1">W1 默认</option>{W1_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}{draft.preset === 'custom' && <option value="custom">自定义</option>}
      </select></label>
      <div className={css.row}><span>编辑配色</span><div className={css.segment}>{(['light', 'dark'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value) }}>{value === 'light' ? '浅色' : '深色'}</button>)}</div></div>
      {([['accent', '强调色'], ['surface', '背景'], ['ink', '前景']] as const).map(([key, label]) => <label className={css.row} key={key}><span>{label}</span><span className={css.colorField}><input type="color" aria-label={`${label}选择器`} value={/^#[\da-f]{6}$/iu.test(colors[key]) ? colors[key] : state.saved[mode][key]} onChange={(event) => { change(key, event.target.value) }} /><input aria-label={`${label}色值`} value={colors[key]} maxLength={7} spellCheck={false} onBlur={() => { attempt(() => { controller.update(draft) }) }} onChange={(event) => { change(key, event.target.value) }} /></span></label>)}
    </div>
    <div className={css.sample} style={{ background: colors.surface, color: colors.ink, borderColor: colors.accent }} aria-label="主题配色预览"><span className={css.sampleAside} style={{ background: `color-mix(in srgb, ${colors.ink} 5%, ${colors.surface})` }}><b>W1</b><span>项目</span><span>工作空间</span></span><span className={css.sampleBody}><b>专注当下的工作</b><span>会话、工具与灵感，在同一个空间。</span><span style={{ color: colors.accent }}>继续探索 →</span></span></div>
    <details className={css.advanced}><summary>高级 · 自定义 CSS</summary><p className={css.description}>支持 W1 的 --dsw-* 颜色变量和 CSS 样式。修改后立即生效并自动保存，无需确认。</p><textarea aria-label="自定义 CSS" value={draft.css} maxLength={20000} spellCheck={false} placeholder={'/* 例如 */\nbody {\n  --dsw-radius-panel: 16px;\n}'} onChange={(event) => { updateDraft({ ...draft, css: event.target.value }) }} /></details>
    <div className={css.actions}>
      <button type="button" onClick={exportTheme}>导出主题</button>
      <label className={css.fileButton}>导入主题<input type="file" accept="application/json,.json" aria-label="导入主题" onChange={(event) => { const file = event.target.files?.[0]; if (file && file.size > 64_000) { setError('主题文件过大'); event.target.value = ''; return } if (file) void file.text().then((text) => { try { updateDraft(validateAppearance(JSON.parse(text))) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } }, () => { setError('无法读取主题文件') }); event.target.value = '' }} /></label>
      <button type="button" className={css.reset} onClick={() => { attempt(() => { controller.reset(); setDraft(structuredClone(W1_DEFAULT)) }) }}>恢复默认</button>
    </div>
    <p className={css.status} role={error ? 'alert' : 'status'}>{error || (JSON.stringify(draft) === JSON.stringify(state.saved) ? state.message : '请输入完整的色值，当前仍使用上次有效配色')}</p>
  </div>
}
