/**
 * Back up a build output directory and restore its previous contents if the build throws.
 * @param output Directory rewritten by the build.
 * @param build Synchronous build step.
 */
export function buildInPlace(output: string, build: () => void): void
