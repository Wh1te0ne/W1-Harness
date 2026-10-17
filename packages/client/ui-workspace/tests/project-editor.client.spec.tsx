// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { ProjectEditor } from '../src/client/ProjectEditor.tsx'
import { zh } from '../src/client/locales.ts'
import type { WorkspaceView, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
afterEach(cleanup)
const t = makeTranslate(zh,commonZh)
it('saves a new primary atomically and only then allows the former primary to be removed', async () => {
  const save = vi.fn(async () => {}), close = vi.fn()
  const project: WorkspaceView = {workspaceId:'one' as WorkspaceId,title:'One',path:'/a',folderRoots:[{id:'a',path:'/a'},{id:'b',path:'/b'}],primaryFolderId:'a',sessionIds:[],createdAt:'',updatedAt:''}
  render(<ProjectEditor project={project} t={t} save={save} close={close} pickFolder={async()=>null} />)
  expect(screen.getByRole('button',{name:'移除文件夹: /a'}).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'设为主要'}))
  fireEvent.click(screen.getByRole('button',{name:'移除文件夹: /a'}))
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'保存'}))
  await waitFor(()=>expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledExactlyOnceWith({title:'One',folderRoots:[{id:'b',path:'/b'}],primaryFolderId:'b'})
})
it('keeps unsaved folder edits out of persisted data when cancelled', async () => {
  const save=vi.fn(async()=>{}),close=vi.fn()
  render(<ProjectEditor t={t} save={save} close={close} pickFolder={async()=>'/new-folder'} />)
  fireEvent.click(screen.getByRole('button',{name:/添加文件夹/}))
  await screen.findByText('/new-folder')
  fireEvent.click(screen.getByRole('button',{name:'取消'}))
  expect(close).toHaveBeenCalledOnce()
  expect(save).not.toHaveBeenCalled()
})
