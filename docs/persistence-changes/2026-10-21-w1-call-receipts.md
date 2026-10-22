---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-21-w1-call-receipts

English | [中文](2026-10-21-w1-call-receipts.zh.md)

## Summary

Adds an optional billingCallId to usage so a durable local receipt can join repeated Session representations without repricing or deduplicating equal independent calls.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-21-w1-call-receipts
baseline: false
changes:
  - root: "event:assistant/attempt"
    previous: "2026-10-21-w1-billing-usage"
    after: "13dcd25bff657bfad3066d6bb1e1d92cead5a7ed369d9b1bd5a373ab9532d69c"
    decision: same-version
  - root: "event:assistant/message"
    previous: "2026-10-21-w1-billing-usage"
    after: "c17343a29600386e5ef7f22452a0b72766540c4cc70858270d4f4021159c3e28"
    decision: same-version
  - root: "event:compaction/summary"
    previous: "2026-10-21-w1-billing-usage"
    after: "4dbe023b5da7ff846244458c981fa94e70631d18cdde3db2360cd55e905e914f"
    decision: same-version
  - root: "event:w1/side-response"
    previous: "2026-10-21-w1-billing-usage"
    after: "5b5660f873ce1ec1c508992256415e6c2f560061fff25879a3b3e24a08ada98b"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing V4 usage remains valid without an ID. New readers display pre-receipt history from stored CNY aggregates and join current usage to immutable receipt amounts; missing IDs do not imply zero cost. Old readers ignore the optional field and preserve unchanged token counts. No event discriminator or existing field meaning changes. Application rollback must preserve or restore the matching ledger snapshot.

<a id="verification"></a>
## Verification

31 usage tests passed, including atomic receipt/aggregate persistence, equal independent calls, ID replay, concurrent writers, cancellation and missing usage, fixed FX/rate snapshots and agreement across ledger, RPC details and wire projection; 23 reply/side-chat/extension tests passed.

<a id="dev-note"></a>
## Dev Note

None.
