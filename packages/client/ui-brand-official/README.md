---
description: "W1 Harness brand occupants for the sidebar and conversation hero, using the approved Fold artwork."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

## Summary

In this W1 checkout, this package fills the sidebar and conversation hero with the approved W1 Fold mark and the W1 Harness name. Registration is enabled when DSH_CLIENT_TITLE is W1 Harness. It has no runtime state and does not affect model requests; its upstream package identity is retained for downstream maintenance.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the browser roster of the W1 deployment. W1 product metadata supplies the client title during local and packaged builds.

### Choosing the profile

`DSH_CLIENT_TITLE` selects this downstream presentation. With W1 Harness, sidebar mark/name and conversation hero mark register; other titles retain their declared fallbacks. The plugin loads in both cases.

### Replacing the brand

The approved geometry and export rules are maintained in the [W1 brand reference](../../../docs/W1品牌规范.md). Sidebar and hero use the same mark component. The sidebar pairs the Fold mark with a 15px Montserrat HARNESS wordmark at 500 weight and 0.1em tracking. The icon supplies the W1 identity without duplicated text; the accessible name remains W1 Harness. Replacing presentation uses the existing slots, without changing conversation or sidebar state.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Declaration-aware `ctx.slots.inject()` registrations wait for the sidebar and hero slots and withdraw on declaration or plugin disposal. The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat. Browser title selection remains a build-environment concern (`DSH_CLIENT_TITLE`).

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the hero.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
