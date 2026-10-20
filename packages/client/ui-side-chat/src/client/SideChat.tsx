import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Modal, MarkdownText, Tooltip, writeClipboard,
  IconSendOutlineRegular, IconStopFillRegular, IconNewChatOutlineRegular,
  IconPlusOutlineRegular, IconCopyOutlineRegular, IconCheckOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, HostObservable, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import { sideModelDirectory, type SideChatModel, type SideState } from './model.ts'
import type { SideKey } from './locales.ts'
import css from './SideChat.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { w1SideChat: SideKey } }
export interface SideInjected {
  readonly actionsFor: (key: string) => Pick<SideChatModel, 'draft' | 'send' | 'stop' | 'model' | 'loadCatalog' | 'cancelClose' | 'confirmClose'>
  readonly newChat: () => void
  readonly keyedHooks: { readonly sideChat: (key: string) => HostObservable<SideState> }
}
export type SideProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<SideInjected> & PropsLocale<'w1SideChat'> & PropsRenderFactories
/** Show the tab's first question, retaining the side-chat icon while its contents change. */
export function SideChatTitle({ useTabInfo, useSideChat, t }:
  PropsRuntime<'sidebar.right.pane.tab.title'> & InjectFace<Pick<SideInjected, 'keyedHooks'>> & PropsLocale<'w1SideChat'>) {
  const { tab } = useTabInfo()
  const state = useSideChat(tab.id)
  const question = state?.messages.find(message => message.role === 'user')?.text
  return <span className={css.tabTitle}><IconNewChatOutlineRegular size={14} /><span>{question?.split('\n')[0] ?? t('title')}</span></span>
}
export function SideChat({ useTabInfo, useSideChat, actionsFor, newChat, t, renderFactorySlot }: SideProps) {
  const { tab } = useTabInfo()
  const state = useSideChat(tab.id)
  const actions = actionsFor(tab.id)
  const scroller = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  const following = useRef(true)
  const composing = useRef(false)
  const compositionEnded = useRef(false)
  const [copied, setCopied] = useState<{ id: number; ok: boolean } | null>(null)
  const running = state?.phase === 'running'
  const markdownLabels = useMemo(() => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }), [t])
  useEffect(() => {
    if (following.current && scroller.current !== null) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [state?.messages, state?.phase])
  useLayoutEffect(() => {
    if (input.current === null) return
    input.current.style.height = 'auto'
    input.current.style.height = String(input.current.scrollHeight) + 'px'
  }, [state?.draft])
  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => { setCopied(null) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copied])
  if (state === undefined) return null
  return <section className={css.root} data-w1-side-chat>
    <div className={css.messages} ref={scroller} onScroll={(event) => {
      const element = event.currentTarget
      following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64
    }}>
      {state.messages.length === 0 ? <div className={css.empty}>
        <IconNewChatOutlineRegular size={26} /><h3>{t('title')}</h3><p>{t('hint')}</p>
      </div> : <div className={css.transcript}>{state.messages.map(message => <div key={message.id} className={message.role === 'user' ? css.user : css.answer}>
        {message.role === 'user' ? message.text : <>
          {message.text === '' && running ? <span className={css.thinking} role="status">{t('thinking')}</span>
            : <MarkdownText text={message.text} labels={markdownLabels} streaming={running && message.id === state.messages.at(-1)?.id} />}
          {message.text !== '' && !(running && message.id === state.messages.at(-1)?.id) && <div className={css.messageActions}>
            <Tooltip label={t(copied?.id === message.id ? copied.ok ? 'copied' : 'copyFailed' : 'copy')} side="top" portal>
              <button type="button" className={css.iconButton} aria-label={t('copy')} onClick={() => {
                void writeClipboard(message.text).then((ok) => { setCopied({ id: message.id, ok }) })
              }}>{copied?.id === message.id && copied.ok
                  ? <IconCheckOutlineRegular size={15} /> : <IconCopyOutlineRegular size={15} />}</button>
            </Tooltip>
          </div>}
        </>}
      </div>)}</div>}
      {state.phase === 'stopped' && <p className={css.status} role="status">{t('stopped')}</p>}
    </div>
    <div className={css.bottom}>
      <div className={css.composeWidth}>
        {state.error !== null && <div className={css.error} role="alert">
          <span>{t('requestFailed')}</span><details><summary>{t('errorDetails')}</summary><pre>{state.error}</pre></details>
        </div>}
        <div className={css.composer} data-composer-card>
          <textarea ref={input} rows={1} aria-label={t('placeholder')} placeholder={state.phase === 'opening' ? t('opening') : t('placeholder')}
            value={state.draft} onChange={(event) => { actions.draft(event.target.value) }}
            onCompositionStart={() => { composing.current = true }}
            onCompositionEnd={() => { composing.current = false; compositionEnded.current = true }}
            onKeyUp={() => { compositionEnded.current = false }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
              // oxlint-disable-next-line typescript/no-deprecated -- Windows IME compatibility.
              if (composing.current || compositionEnded.current || event.nativeEvent.isComposing || event.keyCode === 229) return
              event.preventDefault()
              if (!running) { following.current = true; void actions.send() }
            }} />
          <div className={css.controls}>
            <div className={css.leading}>
              <Tooltip label={t('newChat')} side="top" portal>
                <button type="button" className={`${css.iconButton} ${css.add}`} aria-label={t('newChat')} onClick={newChat}><IconPlusOutlineRegular size={18} /></button>
              </Tooltip>
              <Tooltip label={t('context', { count: state.contextMessages })} side="top" portal>
                <span className={css.mode}><IconNewChatOutlineRegular size={14} /><span>{t('mode')}</span></span>
              </Tooltip>
            </div>
            <div className={css.trailing}>
              {renderFactorySlot('model.selector', {
                state: sideModelDirectory(state), available: true,
                locked: running || state.route === null,
                load: () => { void actions.loadCatalog() },
                select: (selection) => {
                  actions.model(selection)
                  return Promise.resolve({ ok: true, value: undefined })
                },
              })}
              <Tooltip label={t(running ? 'stop' : 'send')} side="top" portal>
                <button className={css.send} type="button" aria-label={t(running ? 'stop' : 'send')}
                  disabled={!running && (state.route === null || state.phase === 'opening' || state.draft.trim() === '')}
                  onClick={() => { following.current = true; if (running) actions.stop(); else void actions.send() }}>
                  {running ? <IconStopFillRegular size={16} /> : <IconSendOutlineRegular size={16} />}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
    <Modal open={state.closeRequested} headless backdropBlur={false} title={t('closeTitle')} onClose={actions.cancelClose} className={css.closeDialog ?? ''}>
      <h2>{t('closeTitle')}</h2><p>{t('closeDescription')}</p>
      <div className={css.closeActions}>
        <Button size="sm" data-modal-autofocus className={css.cancel} onClick={actions.cancelClose}>{t('cancel')}</Button>
        <Button size="sm" variant="outline" className={css.confirm} onClick={actions.confirmClose}>{t('closeConfirm')}</Button>
      </div>
    </Modal>
  </section>
}
