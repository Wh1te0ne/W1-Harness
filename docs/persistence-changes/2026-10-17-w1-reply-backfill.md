---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-17-w1-reply-backfill

English | [中文](2026-10-17-w1-reply-backfill.zh.md)

## Summary

Adds a per-turn reply-attempt record to persist one-time historical backfill admission before auxiliary model work.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-17-w1-reply-backfill
baseline: false
changes:
  - root: "event:w1/reply-attempt"
    previous: null
    after: "e9b30014331880c466eaa0351a4975d96eedbd415a3802921877aaf9e3c17bfc"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing requests and suggestions remain valid and count as earlier attempts. A session with no attempt may backfill its latest completed answer when opened. Existing event payloads are unchanged. Updated readers recognize the added event; older readers without this required name refuse affected sessions safely. The logical session version is unchanged; restore the private backup or retain the updated reader on application rollback.

<a id="verification"></a>
## Verification

Eight Loader-composed tests passed, including JSONL flush, Host disposal and disk resume with zero model requests, one-time historical backfill, failed-attempt reuse and interrupted-turn exclusion.

<a id="dev-note"></a>
## Dev Note

None.
