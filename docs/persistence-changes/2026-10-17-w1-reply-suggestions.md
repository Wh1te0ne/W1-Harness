---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-17-w1-reply-suggestions

English | [中文](2026-10-17-w1-reply-suggestions.zh.md)

## Summary

Adds W1 auxiliary reply request, cached model selection and optional reply suggestion records. These records do not enter the conversation surface or send a user message.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-17-w1-reply-suggestions
baseline: false
changes:
  - root: "event:w1/reply-request"
    previous: null
    after: "65ccf119f527547a49fc47fa143577cca7b757d3d2d5c0c6c702a5dc815b76d7"
    decision: same-version
  - root: "event:w1/reply-route"
    previous: null
    after: "7374010160d7603263c8922f254ee5aa43dcf0455ca765d415d485377aa3461a"
    decision: same-version
  - root: "event:w1/reply-suggestion"
    previous: null
    after: "a14054e936548fe9f74b32a720268e0381b7a50a0c85bba40a193a9d333277b1"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing sessions remain readable and begin with no suggestion or cached route. Updated readers recognize three new discriminated log-only events. Older readers that do not recognize these required event names refuse to reconstruct affected sessions instead of silently misinterpreting them. No existing event payload changes; the logical format version remains unchanged. Rolling back the application requires retaining the updated reader or restoring a private pre-upgrade session backup.

<a id="verification"></a>
## Verification

Loader-composed real agent-loop tests: 4 passed, including model selection, cached routing, no automatic user input, cancellation and unload. Composer and keymap tests: 136 passed, including Tab acceptance without sending, explicit Enter submission, Escape, modifiers and IME.

<a id="dev-note"></a>
## Dev Note

None.
