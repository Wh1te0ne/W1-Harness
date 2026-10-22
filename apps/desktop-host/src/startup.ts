/** Host phase timings contain no profile paths, credentials or session content. */
export function markHostStartup(stage: string): void {
  const started = Number(process.env.W1_LAUNCH_STARTED_AT)
  if (!Number.isFinite(started) || started <= 0) return
  console.info('[w1-startup]', JSON.stringify({ stage, elapsedMs: Date.now() - started }))
}
