/** Undo an interrupted pending-build publication before anything imports build output. */
import { recoverPendingBuilds } from './pending-builds.mjs'
import { fileURLToPath } from 'node:url'
import { isW1Running } from './w1-running.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const rolledBack = recoverPendingBuilds(root, isW1Running)
if (rolledBack) console.info('[w1-startup] rolled back interrupted package build:', rolledBack)
