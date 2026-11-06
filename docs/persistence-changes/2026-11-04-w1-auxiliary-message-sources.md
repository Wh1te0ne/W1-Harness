---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-04-w1-auxiliary-message-sources

English | [中文](2026-11-04-w1-auxiliary-message-sources.zh.md)

## Summary

Acknowledges the inherited Message source additions in w1/goal-review-request, w1/reply-request, and w1/side-request: action-card attribution, optional skill-catalog completeness metadata, and the share-viewer user principal. The Session writer remains V4.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-04-w1-auxiliary-message-sources
baseline: false
changes:
  - root: "event:w1/goal-review-request"
    previous: "2026-10-19-w1-harness-policies"
    after: "3e3a7bf4e16230000c285b8e86015241081dd3554956c7b47bb5ec9cc3c9ed20"
    decision: same-version
  - root: "event:w1/reply-request"
    previous: "2026-10-17-w1-reply-suggestions"
    after: "1c5c35b3ac73689e9d4a54ecaf2ab4d22f3569d7beeb8876fc50e3b7082d80f1"
    decision: same-version
  - root: "event:w1/side-request"
    previous: "2026-10-19-w1-side-chat"
    after: "9aceb6a7ba88b53922602f9127c2f37579d26d0275ad9ed1dd6f7522961b428c"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The additions are nested in the messages arrays of existing log-only auxiliary-request audit events. Every earlier message alternative remains valid; omitted metadata retains its earlier meaning. Current readers preserve older payloads without synthesizing the new fields. Older W1 readers retain the nested JSON and do not turn these audit events into conversation messages, schedule auxiliary requests from them, or derive authorization from their embedded principal. The reply projection reads only the request turn for attempt tracking; goal-review state ignores request audit payloads, and side-chat history is derived from conversation events rather than side-request records. New action-card attribution and skill completeness fields therefore cannot change old audit replay or recovery, and a copied share-viewer principal grants no new authority. This review concerns the nested audit copies; live message admission remains owned by the [share-viewer acknowledgement](2026-10-13-liveshare-share-viewer-principal.md), while [action-card attribution](2026-10-22-action-card-status.md) and [skill completeness](2026-10-25-skill-catalog-incomplete.md) retain their own semantics. Event discriminators, required audit fields, and the Session version are unchanged.

<a id="verification"></a>
## Verification

node node_modules/vitest/vitest.mjs run packages/core/session/tests/canonical-envelopes.spec.ts --maxWorkers=2: 212 tests passed, including append, seed, restore, adoption, snapshot validation, nested metadata retention, and separation of log-only events from message projection. Structural review of the three predecessor inventories against the current inventory identifies only the inherited source changes described above. The six W1 predecessor schema files were separately re-encoded with encodePersistenceSnapshot for the node-table layout; parsing each result reproduced its complete original inventory and every root digest, without changing acknowledgement declarations or finalized checkpoints. Existing W1 goal-review, reply-suggestions, and side-chat composition checks passed during the Alpha integration; the three selected headless recorded-session replays also passed, but do not independently exercise every auxiliary source alternative. Older-reader compatibility here is supported by inspection of their retained event/projection behavior, not by claiming a complete old-binary downgrade run.

<a id="dev-note"></a>
## Dev Note

None.
