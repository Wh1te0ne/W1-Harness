---
description: "Automatic Chrome connection, tab discovery and conversation-owned control for W1."
kind: "package-library"
---

# @deepseek-ai/dsh-w1-chrome-use

English | [中文](README.zh.md)

## Summary

The installed, enabled extension automatically connects Chrome to W1. The model discovers ordinary web tabs, selects a relevant page, or opens a background tab using Chrome's existing login state. No connection code or manual tab sharing is required. The popup shows status and provides global and per-page pauses. Native acceptance remains pending.

## Table of Contents

- [Use this library](#use-this-library)
- [Connection and control](#connection-and-control)
- [Implementation](#implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-library"></a>
## Use this library

The Desktop Host and extension automatically select a matching endpoint within loopback ports 17832–17839. No user port setting is required; saved manual ports and W1_CHROME_BRIDGE_PORT are no longer used by the desktop. Connection waits five seconds and commands have a 30-second deadline. The server starts with the Host and reports when all discovery ports are occupied. [browser-use](../browser-use/README.md) registers `w1_chrome` under the existing browser provider. This library is not a separately installable Cordis bundle.

### Install or update, awaiting native acceptance

1. Installation does not require W1 to be running. In `chrome://extensions`, replace the old unpacked extension with `releases/w1-chrome/0.2.4/` using Developer mode. Older release directories remain unchanged.
2. The extension uses `tabs`, `tabGroups`, `debugger`, `storage`, `alarms` and HTTP host access limited to `127.0.0.1` for readiness checks. When W1 is closed, the popup waits without opening a WebSocket or discovering pages.
3. To use browser control, fully exit and reopen W1 through its normal shortcut to apply the matching Host update, then keep both applications running. The extension connects automatically once ready. There is no connection-code field or share-current-tab button.
4. Ask W1 to use an existing Chrome page. The model lists tabs, filters by title/URL when needed, selects the target and verifies its actions. Installation does not authorize unrelated background tasks or unrequested external changes.

### Build

`node --import tsx/esm scripts/w1/build-chrome-extension.mjs` creates the immutable unpacked version directory and checksums without installing or opening Chrome. `--stage-only` uses a disposable `.work/chrome-extension/` directory. Version 0.2 uses protocol 2 and is incompatible with the retired invitation protocol; update the Host and extension together. See the [upgrade guide](../../../docs/upgrade-guide/v0.2.1-rc.2/w1-chrome-auto-connect/guide.md).

<a id="connection-and-control"></a>
## Connection and control

Startup and worker wake-up read the saved enabled preference and discover a ready local endpoint. A bounded HTTP readiness check precedes WebSocket creation and discovery of at most 200 ordinary HTTP/HTTPS tabs. A stopped Host is a normal waiting state, retried with bounded backoff; an alarm supplies a wake-up fallback. Heartbeats maintain an established connection. Operations are never replayed. Global pause persists across worker restarts and stops pending input immediately. Per-page pauses survive transport reconnection within the worker but reset when the worker is recreated. Version 0.2.4 requires the Host readiness endpoint; earlier Hosts remain unavailable until updated.

The bridge accepts only the fixed extension origin, exact loopback Host/path and versioned messages. The extension accepts control messages only from its own popup or the established local bridge. Browser-internal pages, incognito tabs, URL credentials and oversized payloads are rejected. Connection settings contain no account credentials. Chrome retains its normal login state; W1 does not read its profile files.

Listing exposes bounded page metadata. A model operation leases its target to the actual Agent session on both sides of the bridge; another conversation cannot operate that tab until release. `disconnect` releases only the calling conversation's leases, while the extension remains connected for others. Ordinary cross-site navigation and new background tabs are supported. A user pause cannot be lifted by the model; cancelling Chrome's debugger indicator pauses that tab instead of silently reattaching.

<a id="implementation"></a>
## Implementation

Used pages join a blue W1 tab group in their existing window. Inventory does not regroup unrelated pages; release leaves pages and groups open. Pinned pages are refused rather than silently unpinned. `src/tab-groups.ts` serializes group creation per window and reuses the group after reconnect. Click results distinguish dispatched input, a trusted target click, and the still-unverified page outcome. Background screenshots use a bounded rendered viewport and a five-second deadline; timeout detaches the debugger and clears the busy operation. Failed cleanup pauses the tab. No foreground activation or automatic input replay is used.

The toolbar and extension-management card use the dark-backed W1 application icon so the white Fold mark remains visible on both light and dark surfaces. A local HTTP responder with an incompatible readiness endpoint produces a quit-and-reopen notice rather than an indefinite generic waiting state. The readiness endpoint returns only application identity and protocol version, never tab metadata. Isolated Chromium checks cover installation while the Host is stopped, automatic connection after startup, and a return to waiting after shutdown with zero recorded extension errors.

`src/bridge.ts` owns the listener, conversation leases, deadlines and pending calls. `src/controller.ts` owns discovery and fixed CDP operations; `src/connection.ts` owns automatic reconnection and preferences. `src/worker.ts` checks popup senders. The page function is shared with [browser-use/page](../browser-use/src/page.ts), runs in an isolated main-frame world and accepts no model-provided script or protocol method. The popup uses the established W1 mark and system Chinese/Latin fonts with light and dark themes.

<a id="model-experience"></a>
## Model Experience

[browser-use](../browser-use/README.md) owns the tool schema and Chrome workflow; [tool-selection](../tool-selection/README.md) owns environment selection. `list` can filter by a title/URL substring and returns at most 50 matches with a truncation flag. Page text and JPEG results use the existing durable tool pipeline. This transport library adds no independent prompt or model request, and automatic connection does not modify the stable tool schema.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

One Chrome profile connects to a running W1 Host at a time. The extension is unpacked and not published to the Chrome Web Store. Chrome 116 or newer is required; compatibility references are [worker WebSockets](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) and [debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger). DevTools or managed-browser policy may block debugging. Password entry, file upload/download, cross-origin frame targeting, shadow-root discovery and arbitrary JavaScript remain unsupported. Source/loopback tests, built-worker checks and isolated popup screenshots do not establish native installation, live Chrome interaction or real-model quality.
