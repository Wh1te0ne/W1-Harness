/** Only the extension's own popup may grant or revoke tab access. */
import { ExtensionConnection } from './connection.ts'
import type { ChromeApi } from './extension-api.ts'

declare const chrome: ChromeApi
const connection = new ExtensionConnection(chrome)
void connection.initialize().catch(() => {})
const wake = (): void => { void connection.initialize().then(() => connection.reconnect()).catch(() => {}) }
chrome.runtime.onStartup.addListener(wake)
chrome.runtime.onInstalled.addListener(wake)
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'w1-reconnect') void connection.reconnect() })
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || sender.tab !== undefined) return false
  void connection.popup(message).then((value) => { reply({ ok: true, value }) }, (error: unknown) => {
    reply({ ok: false, error: error instanceof Error ? error.message : 'Chrome extension operation failed' })
  })
  return true
})
