/** Undo an interrupted pending-build publication before anything imports build output. */
import { recoverPendingBuilds } from './pending-builds.mjs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const rolledBack = recoverPendingBuilds(root)
if (rolledBack) console.info('[w1-startup] rolled back interrupted package build:', rolledBack)
