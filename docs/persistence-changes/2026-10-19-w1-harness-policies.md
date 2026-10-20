---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-19-w1-harness-policies

English | [中文](2026-10-19-w1-harness-policies.zh.md)

## Summary

Adds required W1 goal review attempts, exact auxiliary requests and results, MCP schema disclosures, and content-free cache observations.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-19-w1-harness-policies
baseline: false
changes:
  - root: "event:w1/cache-diagnostic"
    previous: null
    after: "4b64d2b340ece3d642162d76afc018185e08978080e36cf9ba7a9236de89365c"
    decision: same-version
  - root: "event:w1/goal-review-attempt"
    previous: null
    after: "a0713c59d948bc301db60f9b4b60d33868b7f8129bcedfa7de0672af2279170b"
    decision: same-version
  - root: "event:w1/goal-review-request"
    previous: null
    after: "12d2cbc3a2d635b8601c7a2154489116d4c62aac385826b562a4844a2d3518ac"
    decision: same-version
  - root: "event:w1/goal-review-result"
    previous: null
    after: "245720d90adc7725dff98b74d36a05d3bbb85da4eb331e8781311c34bbb94e4a"
    decision: same-version
  - root: "event:w1/mcp-disclosure"
    previous: null
    after: "e00cdda96acf7fccca4258952f89b60f2b783b9dce7f834f52573d01acc31e76"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The writer stays V4. New readers accept existing records unchanged. Older readers refuse logs with these unknown required event names before interpretation. Disabling feature flags retains the updated reader. Review attempts are persisted before model calls, restored attempts are never automatically rerun, and MCP selections are revalidated against current schema identity and scope. These events are not marked ignorable.

<a id="verification"></a>
## Verification

200 focused tests passed across 8 files, including Loader compositions, JSONL Host restart, cancellation, stale-goal refusal, replacement-goal race protection, bounded evidence projections, schema/scope revocation, failed disclosure flush, and real DeepSeek serialization against a loopback endpoint. The final 24 plugin tests, scoped production/test typechecks and source lint passed. A plain-Node smoke of the final built artifacts passed all three plugins together. After normal exit, W1 applied four final staged modules, cleared the queue and reached host-ready and workspace-shown in desktop-20261019-160013-066-64624.log; production model quality and native visual acceptance remain unverified.

<a id="dev-note"></a>
## Dev Note

None.
