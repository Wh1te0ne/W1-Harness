/** Composer takeover for one pending approval waterfall. */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ApprovalComposerProps, PendingApproval } from './contract/slots.ts'
import type { InjectFace, HostObservable, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from './ApprovalPanel.module.css'

/**
 * Render one pending approval and its optional Tool-owned detail.
 * @param props - selector-matched request and standard Slot props.
 * @returns The approval composer takeover.
 */
export function ApprovalPanel(props: ApprovalComposerProps) {
  const approval = props.matched
  const [expanded, setExpanded] = useState(false)
  const detail = approval.callId === undefined
    ? null
    : props.renderSlot('conversation.approval.detail', { callId: approval.callId })
  const reason = approval.displayReason === undefined ? approval.reason : props.resolveReason(approval.displayReason)
  if (approval.callId !== undefined && !expanded) return <div className={css.waiting} role="status">
    <StateDot state="warning" /><span>{props.t('waiting')} · {approval.toolName}</span>
    <Button variant="outline" onClick={() => {
      const row = [...document.querySelectorAll<HTMLElement>('[data-chat-call-id]')].find(element => element.dataset.chatCallId === approval.callId)
      const panel = row?.querySelector<HTMLElement>('[data-approval-key]')
      if (panel === undefined || panel === null || panel.getClientRects().length === 0) setExpanded(true)
      else { panel.scrollIntoView({ block: 'center', behavior: 'smooth' }); panel.querySelector('button')?.focus({ preventScroll: true }) }
    }}>{props.t('review')}</Button>
    <Button variant="outline" onClick={() => { setExpanded(true) }}>{props.t('reviewHere')}</Button>
  </div>
  return <ApprovalFlow key={approval.key} pending={approval} reason={reason} detail={detail} t={props.t} />
}

export interface InlineApprovalInjected {
  readonly sessionId: SessionId
  readonly resolveReason: ApprovalComposerProps['resolveReason']
  readonly hooks: { readonly approvalStatus: HostObservable<SessionStatusSnapshot> }
}
export function InlineApproval({ callId, sessionId, useApprovalStatus, resolveReason, t }:
  PropsRuntime<'tool.call.interaction'> & InjectFace<InlineApprovalInjected> & PropsLocale<'approval'>) {
  const pending = useApprovalStatus(status => status.get(sessionId)?.pendingInteraction)
  if (pending?.kind !== 'approval' || pending.callId !== callId) return null
  const reason = pending.displayReason === undefined ? pending.reason : resolveReason(pending.displayReason)
  return <ApprovalFlow key={pending.key} pending={pending} reason={reason} detail={null} t={t} inline />
}

function ApprovalFlow({ pending, reason, detail, t, inline }: {
  pending: PendingApproval
  reason: string | undefined
  detail: ReactNode
  t: ApprovalComposerProps['t']
  inline?: boolean
}) {
  const [answered, setAnswered] = useState(false)
  const [failed, setFailed] = useState(false)
  const waiting = useRef(false)
  const active = useRef(true)
  const composing = useRef(false)
  const compositionEnded = useRef(false)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const answer = (outcome: 'allowed-once' | 'rejected'): void => {
    if (waiting.current || !pending.answerable) return
    waiting.current = true
    setFailed(false)
    setAnswered(true)
    void pending.answer(outcome).catch(() => {
      if (!active.current || !pending.answerable) return
      waiting.current = false
      setAnswered(false)
      setFailed(true)
    })
  }
  const keydown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const element = event.target as Element
    if (event.defaultPrevented || !event.currentTarget.contains(document.activeElement)
      || element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !== null) return
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    if (event.key === 'Enter' && element.closest('button, a[href], [role="button"]') !== null) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    // oxlint-disable-next-line typescript/no-deprecated -- IME 229 covers engines without isComposing.
    if (event.repeat || composing.current || compositionEnded.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    answer(event.key === 'Enter' ? 'allowed-once' : 'rejected')
  }
  return (
    <div className={inline ? css.inline : css.root} data-approval-key={pending.key} aria-busy={answered}
      onKeyDown={keydown}
      onKeyUpCapture={() => { compositionEnded.current = false }}
      onCompositionStartCapture={() => { composing.current = true }}
      onCompositionEndCapture={() => { composing.current = false; compositionEnded.current = true }}>
      <div className={css.card}>
        <div className={css.strip}><StateDot state={answered ? 'ongoing' : 'warning'} />{t('waiting')}</div>
        <div
          className={css.body}
          data-approval-scroll=""
          tabIndex={0}
          role="group"
          aria-label={t('detail.aria')}
        >
          <div className={css.headline}>{reason ?? t('escalation', { toolName: pending.toolName })}</div>
          <div>{pending.toolName} · {t('scope')}</div>
          {detail !== null && <div className={css.command}>{detail}</div>}
        </div>
        {failed && <div role="alert">{t('failed')}</div>}
        <div className={css.actionRow}>
          <Button variant="outline" className={css.reject} disabled={answered} onClick={() => { answer('rejected') }}>
            {t('reject')}
          </Button>
          <Button variant="primary" disabled={answered} onClick={() => { answer('allowed-once') }}>
            {t('allowOnce')}
          </Button>
        </div>
      </div>
    </div>
  )
}
