# W1 reply suggestions

English | [中文](README.zh.md)

After a completed root conversation turn, W1 offers one optional next-user-message draft. The composer shows it only when empty and idle. Tab fills the draft, Escape dismisses it, and the user must separately send it. Existing command menus, modified Tab and IME composition take priority.

## Model selection

The current main model selects from the existing subagent setting's enabled, exact allowed routes. W1 supplies their configured names and descriptions; it does not invent price or latency measurements. The chosen route is cached per session, main model and allowed-route list. Changes to that key cause selection again on the next generation. With selection disabled or unsuccessful, the current main model is inherited. Immediately before generation, a changed allowlist can refuse the selected route.

Suggestions use a tool-free auxiliary request through the normal LLM service and usage accounting. There is no child agent or automatic user message. The request and result are logged outside the main conversation surface; recent human and assistant text supplies context, excluding tools, reasoning and attachments. New turns, session disposal and plugin unload cancel pending work. Generation failure leaves the ordinary composer available and emits a diagnostic without model input or credential content.

## Configuration

The Web bundle supplies all limits: six messages, 12,000 context characters, a 65,536-byte complete input, 768 output tokens, 240 suggestion characters and a 30-second deadline per metadata or model operation. Providers must honor cancellation. Dismissal is local to the mounted composer.

## Saved suggestions and historical conversations

Each session restores its latest suggestion from its durable log. Reopening a conversation or restarting the application reads the saved text without calling a model. Opening an old conversation backfills its latest completed answer only when that turn has no saved suggestion or previous attempt. The application does not scan all stored conversations to generate suggestions at startup.

An attempt record is flushed before model work, and a successful suggestion is flushed after generation. Empty, failed or interrupted attempts are not automatically repeated on reopening. A new completed answer permits one new attempt and supersedes the previous suggestion. Existing suggestion and request records also count as prior attempts. Interrupted historical turns and conversations with no completed assistant text are excluded.

## Model Experience

Selection adds one main-model call when a route decision is missing. Subsequent completed turns normally add one suggestion-model call. Auxiliary input has its own prompt and bounded text context; it does not reuse the main conversation's full prefix or alter its KV-cache history. The selected model's lowest declared reasoning effort is requested. These calls consume usage even when the user ignores the suggestion.

## Known Limitations and Deferred Work

Suggestions depend on model quality and are editable drafts, not evidence of user intent. The model catalog has no verified latency ranking. Unsupported models or empty, truncated, oversized and command-like outputs yield no suggestion. A failed selected route is not retried on another model within that turn. The feature does not infer content from image/file attachments.

Session compatibility and application rollback requirements are recorded in [the initial persistence change](../../../docs/persistence-changes/2026-10-17-w1-reply-suggestions.md) and [the durable backfill change](../../../docs/persistence-changes/2026-10-17-w1-reply-backfill.md). Older builds without the new event names refuse affected sessions; retain the updated reader or restore the private pre-upgrade session backup when rolling back.
