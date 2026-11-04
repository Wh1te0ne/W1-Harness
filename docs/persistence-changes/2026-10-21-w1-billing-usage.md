---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-21-w1-billing-usage

English | [中文](2026-10-21-w1-billing-usage.zh.md)

## Summary

Adds optional reported one-hour cache-write counts and observed billing effort to TokenUsage.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-21-w1-billing-usage
baseline: false
changes:
  - root: "event:assistant/attempt"
    previous: "2026-09-16-session-format-v4"
    after: "a85c5de519481d16f227a4c6adfa907cb1c371ac4fec8f8316a668e953235520"
    decision: same-version
  - root: "event:assistant/message"
    previous: "2026-09-16-session-format-v4"
    after: "dbe08f2101a4f6771e8456b7f0c54310ecb7b3e40a5c7fb2ce9ddbf92cf63929"
    decision: same-version
  - root: "event:compaction/summary"
    previous: "2026-09-16-session-format-v4"
    after: "e0a1051c0b79e8a5a43b8daa0a0435f3209fe02c9b2f4cac7ad2882fd886a216"
    decision: same-version
  - root: "event:w1/side-response"
    previous: "2026-10-19-w1-side-chat"
    after: "959ebeac5d7b0a18ca5c189b6bf147798ffb51840d2a8e80339d7c46a73dd0c3"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing V4 records remain readable. Missing cacheWrite1hTokens means unknown duration, not zero; it is a subset of cacheWriteTokens and never added to total usage. Missing billingParameters cannot authorize a dynamic multiplier. A null outputConfigEffort records actual absence on the outgoing wire. Older readers ignore optional metadata and retain unchanged disjoint token totals. No discriminator or existing meaning changes; keep V4. Historical CNY remains stored and only evidence-backed audit corrections apply.

<a id="verification"></a>
## Verification

65 pi-ai adapter and billing capture tests passed, including a local Anthropic SSE request through the real adapter and BlockAssembler; pricing tests verify distinct write rates, effort multipliers, replay, ledger persistence and historical FX.

<a id="dev-note"></a>
## Dev Note

None.
