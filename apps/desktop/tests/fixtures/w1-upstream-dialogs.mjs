/** Native rendering of pending and integrated W1 releases with a disposable profile. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, protocol, shell } from 'electron'
import { DesktopUpdateDialog } from '../../lib/types/update-dialog.js'
import { DesktopUpdateOverlays } from '../../lib/types/update-overlay.js'
import { resolveDesktopLocale } from '../../lib/types/locale.js'
import { showW1Upstream } from '../../lib/types/w1-upstream-ui.js'

const root = resolve(process.argv[2])
const deadline = setTimeout(() => { console.error('Native dialog verification timed out'); app.exit(1) }, 30000)
mkdirSync(join(root, 'profile'), { recursive: true })
app.setPath('userData', join(root, 'profile'))
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
async function main() {
  await app.whenReady()
  protocol.handle('dsh-app', async request => {
    const name = new URL(request.url).pathname.slice(1)
    assert.ok(['update-dialog.html', 'update-dialog.js', 'update-dialog.css', 'update-close.svg'].includes(name))
    const mime = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html'
    return new Response(await readFile(new URL(`../../renderer/${name}`, import.meta.url)), { headers: { 'content-type': mime } })
  })
  const opened = []
  shell.openExternal = async url => { opened.push(url) }
  const parent = new BrowserWindow({ show: true, width: 960, height: 850 })
  const dialogs = new DesktopUpdateDialog(fileURLToPath(new URL('../../lib/preload-update-dialog.cjs', import.meta.url)),
    resolveDesktopLocale('zh-CN'), new DesktopUpdateOverlays())
  const product = JSON.parse(await readFile(new URL('../../w1-product.json', import.meta.url), 'utf8'))
  const release = { tag: 'dsh-v0.2.1-rc.2', publishedAt: '2026-10-17T08:16:33Z', prerelease: true,
    url: 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2',
    body: '[中文](#cn) | [English](#en)\n\n<h3 id="cn">新增功能</h3>\n\n- 适配 DeepSeek-V4.1-Flash-1017 上线 @LegGasai\n- 适配 DeepSeek Search 与 Fetch API，可在网页搜索设置中开启 @yudshj, @LegGasai\n\n<h3 id="en">New Features</h3>\n\n- Add support for DeepSeek-V4.1-Flash-1017.\n- Add support for DeepSeek Search and Fetch APIs, which can be enabled in Web Search settings.\n\nFull Changelog: [rc.1 → rc.2](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.1...dsh-v0.2.1-rc.2)' }
  const results = []
  try {
    for (const mode of ['pending', 'integrated']) {
      console.log(`Checking ${mode} dialog`)
      const created = once(app, 'browser-window-created', { signal: AbortSignal.timeout(10000) })
      const updates = { product: mode === 'pending' ? { ...product, version: '0.1.0-alpha.2', upstreamTag: 'dsh-v0.2.1-rc.1' } : product,
        state: { releases: mode === 'pending' ? [release] : [], lastSuccess: '2026-10-17T13:22:24Z', error: null },
        check: async () => {}, acknowledge: async () => {} }
      const pending = showW1Upstream(updates, 'zh-CN', options => dialogs.show(parent, options))
      const [, window] = await created
      window.webContents.on('preload-error', (_event, _path, error) => { console.error(error) })
      await once(window.webContents, 'did-finish-load', { signal: AbortSignal.timeout(10000) })
      await window.webContents.executeJavaScript(`new Promise(resolve => {
        const check = () => { if (!document.querySelector('main').hidden) { observer.disconnect(); resolve(); } };
        const observer = new MutationObserver(check); observer.observe(document, {subtree:true, attributes:true}); check();
      })`)
      const readLayout = () => window.webContents.executeJavaScript(`(() => {
        const main = document.querySelector('main').getBoundingClientRect();
        return { text: document.body.innerText, width: main.width, title: document.querySelector('h1').textContent,
          headings: document.querySelectorAll('#release-notes h3').length, items: document.querySelectorAll('#release-notes li').length,
          actionsVisible: [...document.querySelectorAll('#actions button')].every(b => { const r=b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          contentAboveActions: document.querySelector('#release').getBoundingClientRect().bottom <= document.querySelector('#actions').getBoundingClientRect().top,
          isolated: typeof window.require === 'undefined' };
      })()`)
      const layout = await readLayout()
      assert.equal(layout.width, 600)
      assert.equal(layout.actionsVisible, true)
      assert.equal(layout.horizontalOverflow, false)
      assert.equal(layout.contentAboveActions, true)
      assert.equal(layout.isolated, true)
      assert.ok(layout.text.includes('16:16:33'))
      assert.ok(layout.text.includes('GMT+08:00'))
      assert.ok(!layout.text.includes('<h3'))
      if (mode === 'pending') {
        assert.equal(layout.headings, 2)
        assert.equal(layout.items, 4)
        await window.webContents.executeJavaScript("document.querySelector('#release-notes a[href^=\"https:\"]').click()")
        await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 100))')
        assert.equal(opened.length, 1)
        await assert.rejects(window.webContents.executeJavaScript("dshUpdateDialog.status().then(v => dshUpdateDialog.openLink(v.revision, 'file:///C:/private'))"))
      } else assert.ok(layout.text.includes('暂无待跟进版本'))
      await writeFile(join(root, `${mode}.png`), (await window.webContents.capturePage()).toPNG())
      if (mode === 'pending') {
        parent.setSize(440, 760)
        await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 200))')
        const narrow = await readLayout()
        assert.equal(narrow.horizontalOverflow, false)
        assert.equal(narrow.contentAboveActions, true)
        assert.equal(narrow.actionsVisible, true)
        await writeFile(join(root, 'pending-narrow.png'), (await window.webContents.capturePage()).toPNG())
        parent.setSize(960, 850)
      }
      const closed = once(window, 'closed', { signal: AbortSignal.timeout(10000) })
      await window.webContents.executeJavaScript("document.getElementById('close').click()")
      await pending
      await closed
      results.push({ mode, ...layout })
    }
    await writeFile(join(root, 'result.json'), JSON.stringify({ nativeElectron: process.versions.electron, results, externalLinksOpened: opened }, null, 2))
    console.log('W1 pending/integrated dialogs, narrow layout and release-link isolation passed.')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    clearTimeout(deadline)
    dialogs.dispose()
    parent.destroy()
    app.quit()
  }
}

void main().catch(error => { console.error(error); app.exit(1) })
