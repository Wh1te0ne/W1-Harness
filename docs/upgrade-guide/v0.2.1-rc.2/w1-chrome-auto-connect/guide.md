---
kind: upgrade-guide
description: "W1 Chrome 0.2 replaces manual tab-sharing invitations with automatic browser connection."
---

# W1 Chrome automatic connection

English | [中文](guide.zh.md)

## Change

The W1 Chrome extension 0.2.0 and Host use protocol 2. The 0.1.0 extension cannot connect to the updated Host. Connection codes, sharing the current tab, and same-site-only grants are removed. The enabled extension discovers ordinary tabs automatically; W1 chooses a target or opens a background page. Installation now authorizes discovery of ordinary tabs, while task instructions and global/per-page pause still govern operations. `w1_chrome.disconnect` releases only the current conversation's tab leases.

## Migration

Version 0.2.4 groups used pages under W1, adds trusted-click receipts and bounded screenshot recovery. Reconnect still invalidates old handles: list and read before sending new input. Desktop taskbar and tray icons now both follow application mode: white background with a dark mark in light mode, dark background with a white mark in dark mode.

1. Exit W1 completely and reopen it through its normal shortcut to apply pending builds. Do not use Restart inside an old crash dialog to apply development updates.
2. Remove the old unpacked extension in `chrome://extensions`, then load `releases/w1-chrome/0.2.4/` using Developer mode. W1 may be closed during installation. The public extension ID is preserved; permissions include `storage`, `alarms`, `tabGroups` and HTTP access to `127.0.0.1` for readiness. Old release files remain unchanged.
3. Keep W1 and Chrome running. The popup should show connected automatically; ask W1 to list Chrome tabs without providing a code or sharing a tab.
4. Use Pause connection to disable access, or expand Page access to pause one page. Global pause is saved. Ports are discovered automatically; old manual port preferences and W1_CHROME_BRIDGE_PORT are no longer used.

Version 0.2.4 waits for the Host readiness endpoint before opening a WebSocket. Apply the matching Host build before using control; installation itself works offline. Isolated Chromium verifies zero recorded errors while offline and automatic connection after startup. Personal-profile installation and live interaction remain pending; see [Chrome documentation](../../../../packages/w1/chrome-use/README.md).
