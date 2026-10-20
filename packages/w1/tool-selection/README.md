---
description: "Product-level guidance for selecting tools and browser environments in W1 Desktop."
kind: "package-reference"
---

# @deepseek-ai/dsh-w1-tool-selection

English | [中文](README.zh.md)

## Summary

W1 Desktop mounts this Cordis plugin to guide tool selection within the user's task. It covers dedicated tools, files, Shell, search, page fetching, skills, and browser environments. It adds no tools or permissions. Browser operation steps belong to [browser-use](../browser-use/README.md).

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The Desktop Host mounts the plugin automatically alongside the existing prompt and tool services; there is no configuration or separate installation command. Users describe the task without naming a tool. Explicit targets, read-only requests, and exclusions of browser or desktop acceptance take precedence over proactive tool use.

| Task | Selection guidance |
|---|---|
| Explicit browser or tab | Honor that target; report unavailable targets rather than silently switching |
| Localhost, frontend rendering or interaction | Use the available built-in browser and reuse a relevant conversation-owned tab |
| Existing Chrome login or external business tab | Use `w1_chrome` when available, check automatic connection, discover tabs and select the relevant page without manual sharing |
| Information lookup or ordinary page text | Search or fetch; use the browser when rendering or interaction is necessary |
| Supported service or file operation | Prefer the relevant dedicated tool; use Shell for builds, tests, processes, or uncovered operations |

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Prompt composition and lifecycle</summary>

[src/index.ts](src/index.ts) registers `w1:tool-selection` through `ctx.systemPrompt.section`. General guidance remains available without a browser. Browser environment advice follows scoped visibility of `w1_browser` and `w1_chrome`; an absent Chrome tool is described as unavailable. Disposal removes the section. The Desktop Host owns mounting; this package does not modify the Agent loop, select a model, or change execution guards.

</details>

<a id="model-experience"></a>
## Model Experience

### Selection guidance

#### What the model sees

The section starts with “Choose tools proactively when they help complete the user's current task; the user need not name a tool.” It distinguishes separate built-in state from the user's regular Chrome profile and requires checking the automatic connection and selecting an available tab before use. The [built-in recording](../../../snapshots/session/w1-browser-use/system-prompt.expected.md) and [Chrome recording](../../../snapshots/session/w1-chrome-use/system-prompt.expected.md) pin the available environments and workflows.

#### Token effect

Guidance adds system-prompt text to model requests. It does not expose extra tool schemas or initiate additional model requests.

#### KV Cache effect

The text remains stable for the same visible capabilities. A scope gaining or losing either browser tool changes its browser guidance. The normal prompt assembly and Session logging own request updates.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

These are model instructions, not a deterministic router or permission grant. Synthetic composition and keyless replay verify delivery, scope filtering, and persistence; they do not measure a real model's tool-selection accuracy or native browser behavior. [Chrome connection and extension](../chrome-use/README.md) are owned separately; tool visibility alone does not imply connection; user pauses and other conversations’ tab leases remain enforced. Desktop control is not implemented here.
