/** Edit one project's name, source folders and primary folder as one saved change. */
import { useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Button, Modal, IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceView, WorkspaceProjectCreateRequest } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceBrowserProps } from './contract/slots.ts'
import css from './ProjectEditor.module.css'

interface Props {
  project?: WorkspaceView | undefined
  pickFolder: () => Promise<string | null>
  save: (input: WorkspaceProjectCreateRequest) => Promise<void>
  close: () => void
  t: WorkspaceBrowserProps['t']
}

/** Keep unsaved edits local; directory selection alone never changes the project. */
export function ProjectEditor({ project, pickFolder, save, close, t }: Props) {
  const [title, setTitle] = useState(project?.title ?? '')
  const [folders, setFolders] = useState(() => project?.folderRoots ?? (project === undefined ? [] : [{ id: 'primary', path: project.path }]))
  const [primary, setPrimary] = useState<string | null>(() => project === undefined ? null : project.primaryFolderId === undefined ? 'primary' : project.primaryFolderId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = async () => {
    setBusy(true); setError(null)
    try {
      const path = await pickFolder()
      if (path === null || folders.some(folder => folder.path === path)) return
      const id = randomUUID()
      setFolders([...folders, { id, path }])
      if (folders.length === 0) setPrimary(id)
      if (!title.trim()) setTitle(path.split(/[\\/]/).filter(Boolean).at(-1) ?? path)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const commit = async () => {
    setBusy(true); setError(null)
    try { await save({ title: title.trim(), folderRoots: folders, primaryFolderId: primary }); close() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }
  return <Modal open className={css.dialog ?? ''} onClose={() => { if (!busy) close() }} closeLabel={t('close')}
    title={t(project === undefined ? 'project.create' : 'project.edit')}
    footer={<><Button variant="outline" disabled={busy} onClick={close}>{t('cancel')}</Button>
      <Button variant="primary" disabled={busy || !title.trim()} onClick={() => { void commit() }}>{t('project.save')}</Button></>}>
    <div className={css.content}>
      <label className={css.label}>{t('project.name')}<input className={css.input} data-modal-autofocus value={title} disabled={busy}
        onChange={(event) => { setTitle(event.target.value) }} /></label>
      <div className={css.label}>{t('project.folders')}</div>
      <div className={css.folders}>
        {folders.map(folder => <div className={css.row} key={folder.id}>
          <IconFolderOpenRegular size={18} />
          <div className={css.path} title={folder.path}>{folder.path}</div>
          {primary === folder.id ? <span className={css.primary}>{t('project.primary')}</span>
            : <button className={css.action} disabled={busy} onClick={() => { setPrimary(folder.id) }}>{t('project.makePrimary')}</button>}
          <button className={css.remove} disabled={busy || primary === folder.id && folders.length > 1}
            title={primary === folder.id && folders.length > 1 ? t('project.choosePrimaryFirst') : t('project.removeFolder')}
            aria-label={t('project.removeFolder') + ': ' + folder.path}
            onClick={() => {
              setFolders(folders.filter(item => item.id !== folder.id))
              if (primary === folder.id) setPrimary(null)
            }}>×</button>
        </div>)}
        <button className={css.add} disabled={busy} onClick={() => { void add() }}>＋ {t('project.addFolder')}</button>
      </div>
      {folders.length > 0 && <p className={css.hint}>{t('project.primaryHint')}</p>}
      {error !== null && <div role="alert" className={css.error}>{error}</div>}
    </div>
  </Modal>
}
