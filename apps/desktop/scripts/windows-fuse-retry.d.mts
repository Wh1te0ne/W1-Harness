/** Retry only transient Windows sharing violations while preserving the operation's result. */
export function retryWindowsFuses<T>(
  operation: () => Promise<T>, platform?: NodeJS.Platform,
  pause?: (milliseconds: number) => Promise<unknown>,
): Promise<T>
