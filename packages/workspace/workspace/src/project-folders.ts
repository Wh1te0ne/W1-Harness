/** Canonical project folder selection and defaults for legacy single-folder records. */
import { mkdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceFolder, WorkspaceProjectInput } from './types.ts'
import { realpathNormalize } from './paths.ts'

/**
 * Read legacy records as one primary folder without rewriting their identities.
 * @param record - Stored project row, including legacy single-folder records.
 * @returns Associated folders, projecting legacy records to one primary folder.
 */
export function projectFolders(record: { path: string; folderRoots?: readonly WorkspaceFolder[] | undefined }): readonly WorkspaceFolder[] {
  return record.folderRoots ?? [{ id: 'primary', path: record.path }]
}

/**
 * Validate a complete folder selection; unchanged unavailable folders remain associated.
 * @param input - Project name, folder roots and primary-folder selection.
 * @param existing - Previously associated folders that may remain unavailable.
 * @returns Validated canonical folder roots with their stable identifiers.
 */
export async function normalizeProjectFolders(
  input: WorkspaceProjectInput, existing: readonly WorkspaceFolder[] = [],
): Promise<WorkspaceFolder[]> {
  const ids = new Set<string>()
  const paths = new Set<string>()
  const folders: WorkspaceFolder[] = []
  for (const folder of input.folderRoots) {
    if (!folder.id.trim() || ids.has(folder.id)) throw new Error('Project folder IDs must be nonempty and unique')
    const retained = existing.some(item => item.id === folder.id && item.path === folder.path)
    const path = retained ? folder.path : await realpathNormalize(folder.path)
    if (!retained && !(await stat(path)).isDirectory()) throw new Error('Project folder is not a directory')
    if (paths.has(path)) throw new Error('The same directory cannot be added twice to a project')
    ids.add(folder.id); paths.add(path); folders.push({ id: folder.id, path })
  }
  if (folders.length === 0 ? input.primaryFolderId !== null : !ids.has(input.primaryFolderId ?? '')) {
    throw new Error('A project with folders requires exactly one primary folder')
  }
  if (!input.title.trim()) throw new Error('A project requires a name')
  return folders
}

/**
 * Create the private working directory for a project without associated source folders.
 * @param id - Stable identifier within the owning project or side-chat connection.
 * @returns Absolute private working directory for the project.
 */
export async function projectWorkingDirectory(id: string): Promise<string> {
  const root = process.env.W1_DOCUMENTS_DIR ?? join(homedir(), '.w1-harness', 'projects')
  const directory = join(root, id)
  await mkdir(directory, { recursive: true })
  return realpathNormalize(directory)
}
