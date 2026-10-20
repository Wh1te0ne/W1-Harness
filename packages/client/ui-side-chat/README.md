---
description: "Right-sidebar interface for W1 temporary side conversations."
kind: "package-reference"
---
# W1 side-chat interface

English | [中文](README.zh.md)

## Summary

Registers Side chat in the existing sidebar Start page and renders independent chat tabs. The [Host service](../../w1/side-chat/README.md) owns model requests, context snapshots and temporary logs. This package owns tab-local drafts, streaming presentation, model choice and input handling.

## Table of Contents

- [Behavior](#behavior)
- [Verification](#verification)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Behavior

Hidden tabs retain their state. The opening main-conversation snapshot is always included; there is no context checkbox. Empty tabs close immediately. Closing or replacing a populated tab asks for confirmation; Cancel and Escape retain history, draft and the live request. Confirm disposes only that tab. A late confirmation cannot act on a replaced occurrence. Every tab receives its own model instance; no main-session submit, stop, queue or draft action is called.

The side chat uses the main conversation background and composer design: panel radius, elevation stroke, text sizing, toolbar spacing and blue send button. Its content and card widths follow the embedded conversation limits (920px and 952px). The side-chat footer shows no token statistics; existing main-conversation statistics remain on the main composer. The tab title follows its first question. Main and side composers render the same `model.selector` Factory from [ui-model-selection](../ui-model-selection/README.md), including provider grouping, search, viewport limits, keyboard controls, model labels and advertised reasoning efforts. Each side tab supplies its own state and selection callback, so changing its model or effort never calls the main Session's `selectModel`. The Client declares both `remote.w1SideChat` and `remote.session`, mounted by the Remote assembly before activation. Model discovery failure retains the opening route and exposes Retry in the shared picker.

## Verification

`tests/apply.client.spec.ts` composes real Cordis service tracing, SlotRegistry and the sidebar controller to cover namespace injection and close behavior. Model and view tests cover independent turns, catalog failure/retry, shared-picker search and reasoning selection, request routing, default context, drafts, IME keys, Stop and the confirmation dialog. Browser component checks use synthetic conversations.

## Model Experience

### Side-chat submissions

#### What the model sees

The Client submits the user's text and selected route through `w1SideChat.send`, always including the opening context. The [Host service](../../w1/side-chat/README.md#model-experience) owns the instruction, frozen main context and side history; the Client adds no independent instruction.

#### Token effect

Each side question makes an independent model request. Removing the checkbox does not remove context tokens; model discovery and close confirmation make no inference requests.

#### KV Cache effect

The Client never rewrites the main request prefix. The Host owns the side prefix; selecting another model may change that side request's cache behavior.

## Known Limitations and Deferred Work

- Real desktop rendering and provider availability require separate verification.

Feature scope and limitations live in the Host README linked above.
### Dev Note

Verification evidence and remaining native acceptance items are maintained in [the W1 work log](../../../docs/工作记录.md).
