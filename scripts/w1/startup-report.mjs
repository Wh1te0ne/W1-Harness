/** Credential-free launch timing and bounded progress updates. */
export function startupReporter(startedAt = Number(process.env.W1_LAUNCH_STARTED_AT), emit = value => console.info('[w1-startup]', JSON.stringify(value))) {
  let previousPhase
  let previousTime = 0
  return (stage, progress = {}) => {
    const now = Date.now()
    if (progress.phase === previousPhase && now - previousTime < 500 && progress.completed !== progress.total) return
    previousPhase = progress.phase
    previousTime = now
    emit({ stage, ...progress, elapsedMs: Number.isFinite(startedAt) && startedAt > 0 ? now - startedAt : 0 })
  }
}
