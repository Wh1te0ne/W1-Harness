/** Queue validated local bundles without changing the active process. */
export function queuePackageBuild(root: string, target: string, output: string): void
/** Publish queued bytes only after the running-instance check returns false. */
export function publishPendingBuilds(root: string, isRunning: () => boolean): number
