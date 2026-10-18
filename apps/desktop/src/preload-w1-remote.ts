/** Isolated bridge, restricted to the app-owned remote-device window. */
import { contextBridge, ipcRenderer } from 'electron'
if (location.protocol === 'data:') contextBridge.exposeInMainWorld('w1Remote', {
  invoke: (action: string, value?: unknown): Promise<unknown> => ipcRenderer.invoke('w1-remote:manage', action, value) as Promise<unknown>,
})
