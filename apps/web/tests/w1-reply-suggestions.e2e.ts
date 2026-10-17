/** Built composer over the real Host projection feed; the suggested text is a deterministic fixture. */
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { mkdir } from 'node:fs/promises'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'

it('renders a multiline suggested reply and Tab fills the draft without sending', async () => {
  const scaffold = await launchWebScaffold({ replySuggestions: true })
  try {
    const browser = await chromium.launch()
    try {
      const page = await newEnglishPage(browser)
      const consoleState = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      await connectFreshWorkspace(page, scaffold.workspaceCwd, 'reply-suggestion')
      const agent = scaffold.ctx.agents.roots()[0]!
      expect(agent).toBeDefined()
      const text = '请先说明需要修改哪些地方，沿用现有界面和快捷键；只更新开发版，完成后我再确认是否发送下一条消息。'
      const input = page.locator('[data-composer-input][contenteditable="true"]').first()
      agent.session.append('w1/reply-suggestion', { turn: 0, text, route: { provider: 'fixture', model: 'fixture' } })
      const ghost = page.locator('[data-composer-placeholder]').first()
      await expect.poll(() => ghost.textContent()).toContain(text)
      expect(await input.textContent()).toBe('')
      const box = await ghost.boundingBox()
      const card = await page.locator('[data-composer-card]').first().boundingBox()
      expect(box).not.toBeNull()
      expect(card).not.toBeNull()
      expect(box!.y + box!.height).toBeLessThan(card!.y + card!.height)
      await mkdir('.work/reply-suggestions', { recursive: true })
      await page.screenshot({ path: '.work/reply-suggestions/browser.png' })
      await input.click()
      await input.press('Tab')
      await expect.poll(() => input.innerText()).toBe(text)
      expect(agent.session.snapshotEvents().filter(event => event.type === 'user/message')).toHaveLength(0)
      expect(consoleState.pageErrors).toEqual([])
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
