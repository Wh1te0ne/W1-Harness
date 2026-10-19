/** Emit only startup phase timings; no session or authentication data is recorded. */
/** @param stage - Completed startup phase; ignored outside the W1 launcher. */
export function markW1Startup(stage: string): void {
  const started = Number(process.env.W1_LAUNCH_STARTED_AT)
  if (!Number.isFinite(started) || started <= 0) return
  console.info('[w1-startup]', JSON.stringify({ stage, elapsedMs: Date.now() - started }))
}
