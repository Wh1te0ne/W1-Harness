---
description: "Control conversation-owned W1 built-in browser tabs and pause Agent input."
kind: "package-reference"
---

# @deepseek-ai/dsh-w1-browser-use

English | [中文](README.zh.md)

## Summary

The Agent can open, read, navigate, click, fill, scroll, press common keys, go back, and capture screenshots in W1's built-in browser. Each tab belongs to one conversation. The user can pause control in its toolbar; resuming requires a user action. With the Desktop Host's [Chrome transport](../chrome-use/README.md), the same provider also registers `w1_chrome` for automatically discovered external tabs; neither tool operates the Windows desktop.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The desktop Host mounts this Cordis plugin with a private transport. It is not a separately installable bundle or a Web-only plugin. The composition supplies a 30-second operation deadline, 12,000 page-text characters and 100 element descriptions; the executor also bounds the complete encoded observation. Open the intended conversation in W1 before asking it to create a browser tab.

The optional `chromeRequest` callback adds the separate `w1_chrome` tool and its scoped workflow; it does not reserve another browser provider. Chrome supports the same page actions plus `connect` and `disconnect`. Automatic connection and tab discovery are separate from the built-in browser, with [extension setup and control](../chrome-use/README.md#connection-and-control) owned by the Chrome transport. Model-supplied session IDs cannot change either tool's caller.

Describe the task, for example: “Check whether the name field on this page works.” Naming the browser tool is optional: guidance asks the Agent to use it proactively when rendering, interaction, or visual checks are needed, subject to your restrictions. Pause/Allow controls affect that tab. Cancelling a turn stops subsequent input; input already delivered is not rolled back. Read the current page before retrying a cancelled or timed-out operation.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Execution and lifecycle</summary>

The plugin registers one provider and the w1_browser tool. The actual Agent session supplies ownership; the model cannot supply a different session. Private child-process messages reach the desktop executor, which verifies the approved guest lease and conversation before each operation. Renderer IPC requires the main product document. Fixed scripts run in a guest isolated world; model arguments cannot supply JavaScript, a protocol method, or an Electron object. Clicks and keys target the guest webContents without OS input injection.

The executor rejects overlapping operations on one tab. Pausing, closing, disconnecting and cancelling stop pending work. Cancelled operations retain their busy state until the underlying work settles. New reads, fills, clicks and document replacement invalidate old element refs; navigation during lookup rejects input. Failed input has an unknown outcome until a fresh observation. Text and screenshots use the existing tool-result and attachment pipeline.

</details>

<a id="model-experience"></a>
## Model Experience

### Browser tool

#### What the model sees

The tool description documents supported actions, fresh element refs, untrusted page content and verification. The generic tool card displays the action and result. Observations include labels and non-sensitive form values; password and file values are excluded. Screenshots require an image-capable model and attachment storage. The `w1:browser-workflow` prompt section asks the Agent to list and reuse the intended tab, read fresh refs, perform dependent actions sequentially, and read again to verify the outcome. Visual changes require screenshot inspection when supported. Pause, refusal, unsupported operations, and uncertain outcomes must be reported rather than bypassed or blindly retried. The section is absent when this tool is restricted, shadowed, or unloaded. [Product-level selection](../tool-selection/README.md) owns the choice between tools and browser environments.

#### Token effect

The tool schema, workflow guidance and observations consume context. Observations persist as tool results; screenshots use attachment references.

#### KV Cache effect

The unchanged tool schema and workflow supply a stable request prefix. New observations append to conversation history; changing tool visibility changes its guidance and tool prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The built-in tool reads the main document's light DOM. Cross-origin frames, shadow-root element discovery, uploads, downloads, password input and arbitrary JavaScript are unsupported; external tabs use the separate Chrome tool. Built-in website storage remains process-local. Opening a built-in tab requires an adopted conversation in the desktop client; an unavailable view times out instead of redirecting the operation to another conversation. Canvas element targeting is deferred. Clicks and keys use the guest debugger; an already occupied debugger causes an explicit refusal without detaching the other client.

Validation uses synthetic pages, real Cordis/Agent-loop composition, a keyless shipped-headless-profile recording and fake Electron guests. These tests do not establish native acceptance or actual model performance. Local build and acceptance status are in the [W1 work log](../../../docs/工作记录.md).
### Dev Note

Verification evidence and remaining native acceptance items are maintained in [the W1 work log](../../../docs/工作记录.md).
