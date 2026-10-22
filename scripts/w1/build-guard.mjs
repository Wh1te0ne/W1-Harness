/** Run a build that rewrites an output directory in place, undoing it when the build fails. */
import { cpSync, existsSync, renameSync, rmSync } from 'node:fs'

const discard = path => rmSync(path, { recursive: true, force: true })

/**
 * Back up `output`, run a synchronous build, and restore the previous contents if the build throws.
 * The live directory keeps serving throughout the build; only a failed build swaps the backup back in.
 * @param {string} output Directory the build rewrites.
 * @param {() => void} build Synchronous build step.
 */
export function buildInPlace(output, build) {
  const backup = output + '.w1-prev'
  const previous = existsSync(output)
  discard(backup)
  try {
    if (previous) cpSync(output, backup, { recursive: true })
  } catch (error) {
    throw new Error('Close W1 before rebuilding its desktop shell: ' + error.message)
  }
  try {
    build()
    if (previous && !existsSync(output)) throw new Error('The build removed its output directory without writing a replacement')
  } catch (error) {
    discard(output)
    if (previous) renameSync(backup, output)
    throw error
  }
  discard(backup)
}
