/** Unfolded transcript-tail approval; the ordinary composer stays mounted. */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { PendingApproval, type ApprovalComposerProps } from './contract/slots.ts'
import css from './ApprovalPanel.module.css'

/**
 * Render one pending approval and its optional Tool-owned detail.
 * @param props - selector-matched request and standard Slot props.
 * @returns An expanded approval card.
 */
export function ApprovalPanel(props: ApprovalComposerProps) {
  const approval = props.matched
  const detail = approval.callId === undefined
    ? null
    : props.renderSlot('conversation.approval.detail', { callId: approval.callId })
  const reason = approval.displayReason === undefined ? approval.reason : props.resolveReason(approval.displayReason)
  return <ApprovalFlow key={approval.key} pending={approval} reason={reason} detail={detail} t={props.t} />
}

/** Resolve only this Session's current approval, regardless of Tool folding. */
export function ApprovalTail(props: Omit<ApprovalComposerProps, 'matched'>) {
  const pending = props.useSessionStatus(status => status.get(props.sessionId)?.pendingInteraction)
  return pending instanceof PendingApproval ? <ApprovalPanel {...props} matched={pending} /> : null
}

function ApprovalFlow({ pending, reason, detail, t }: {
  pending: PendingApproval
  reason: string | undefined
  detail: ReactNode
  t: ApprovalComposerProps['t']
}) {
  const root = useRef<HTMLDivElement>(null)
  const [answered, setAnswered] = useState(false)
  const [failed, setFailed] = useState(false)
  const waiting = useRef(false)
  const active = useRef(true)
  const composing = useRef(false)
  const compositionEnded = useRef(false)
  useEffect(() => {
    active.current = true
    // Reveal the new card once, without taking keyboard focus from the composer.
    root.current?.scrollIntoView({ block: 'nearest' })
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
    if (event.key === 'Enter' && element.closest('button, a[href], summary, [role="button"]') !== null) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    // oxlint-disable-next-line typescript/no-deprecated -- IME 229 covers engines without isComposing.
    if (event.repeat || composing.current || compositionEnded.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    answer(event.key === 'Enter' ? 'allowed-once' : 'rejected')
  }
  return (
    <div ref={root} className={css.root} data-approval-key={pending.key} aria-busy={answered}
      onKeyDown={keydown}
      onKeyUpCapture={() => { compositionEnded.current = false }}
      onCompositionStartCapture={() => { composing.current = true }}
      onCompositionEndCapture={() => { composing.current = false; compositionEnded.current = true }}>
      <div className={css.card}>
        <div className={css.strip} role="status" aria-live="polite"><StateDot state={answered ? 'ongoing' : 'warning'} />{t('waiting')}</div>
        <div
          className={css.body}
          data-approval-scroll=""
          tabIndex={0}
          role="group"
          aria-label={t('detail.aria')}
        >
          <div className={css.headline}>{reason ?? t('escalation', { toolName: pending.toolName })}</div>
          <div className={css.scope}>{pending.toolName} · {t('scope')}</div>
          {detail !== null && <details className={css.details}>
            <summary>{t('detail.show')}</summary>
            <div className={css.command}>{detail}</div>
          </details>}
        </div>
        {failed && <div className={css.error} role="alert">{t('failed')}</div>}
        <div className={css.actionRow}>
          <Button size="sm" variant="outline" className={css.reject} disabled={answered} onClick={() => { answer('rejected') }}>
            {t('reject')}
          </Button>
          <Button size="sm" variant="primary" disabled={answered} onClick={() => { answer('allowed-once') }}>
            {t('allowOnce')}
          </Button>
        </div>
      </div>
    </div>
  )
}
