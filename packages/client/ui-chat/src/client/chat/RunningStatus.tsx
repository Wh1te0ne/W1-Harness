/** Running Turn clock isolated from the transcript's render cycle. */
import { memo, useEffect, useMemo, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatFlowSlotProps, ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './message-chrome.ts'
import { RunningMark } from './RunningMark.tsx'
import { liveOutput } from './live-output.ts'
import { formatExactTokens } from './token-format.ts'
import a11yCss from './accessibility.module.css'
import css from './ChatView.module.css'

interface RunningStatusProps extends Pick<ChatFlowSlotProps, 'useChatTurnAssistants'> {
  readonly startTime: number | undefined
  readonly turn: number | undefined
  /** Freeze the shown duration while the Client cannot observe the Session. */
  readonly paused: boolean
  /** Keep the slot without showing or announcing the status: the Session stopped before its Turn closed. */
  readonly holding?: boolean
  readonly t: ChatViewSlotProps['t']
}

/**
 * Show live elapsed time after the current Turn's content without announcing ticks.
 * @param props - Current Turn start time, pause state, and localized copy.
 * @returns the compact running indicator; mount while the Session is running, or holding its slot hidden until the
 * Turn's actions row replaces it.
 */
export const RunningStatus = memo(function RunningStatus({
  startTime, paused, holding = false, turn, useChatTurnAssistants, t,
}: RunningStatusProps) {
  const assistants = useChatTurnAssistants(turn === undefined ? '' : String(turn), value => value)
  const output = useMemo(() => liveOutput(assistants), [assistants])
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (startTime === undefined || paused || holding) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime, paused, holding])
  const label = startTime === undefined ? t('chat.deepDiving') : t('chat.deepDivingFor', {
    duration: formatRunDuration(Math.max(1000, now - startTime), t).map(part => part.text).join(''),
  })
  return (
    <div className={css.running} data-chat-running data-holding={holding ? '' : undefined} aria-hidden={holding || undefined}>
      {holding ? null : (
        <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      )}
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        <RunningMark />
        <span className={css.runningText}>{label}</span>
        {turn !== undefined && <Tooltip label={t('chat.liveOutputHint')} side="top">
          <span className={css.runningTokens} data-live-output data-estimated={output.estimated || undefined}>
            {t(output.estimated ? 'chat.liveOutputEstimated' : 'chat.liveOutput', { count: formatExactTokens(output.tokens, t) })}
          </span>
        </Tooltip>}
      </span>
    </div>
  )
})
