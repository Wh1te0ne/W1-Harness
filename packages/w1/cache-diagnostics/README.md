---
description: "Configure or debug W1 cache-diagnostics behavior, limits, persistence, and validation."
kind: "package-reference"
---

# @deepseek-ai/dsh-w1-cache-diagnostics

English | [中文](README.zh.md)

## Summary

Users can distinguish changed request prefixes from stable inputs without observed cache reads. The usage dialog labels normalized observations C1 and actual DeepSeek serialized observations C2. Diagnostics add no model requests and preserve missing counters as unknown.

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

Mount this plugin beside the W1 Web services. The shipped W1 composition explicitly enables it; its standalone `enabled` default is false. Disable the flag to stop the behavior while retaining updated session readers.

```yaml
- name: '@deepseek-ai/dsh-w1-cache-diagnostics'
  config:
    enabled: true
    maxSessions: 32
    maxRoutes: 8
    maxMessages: 2048
    maxReports: 40
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Enable this policy. |
| `maxSessions` | required | Sessions retaining digest baselines. |
| `maxRoutes` | required | Model/effort routes per session. |
| `maxMessages` | required | Message digests per baseline. |
| `maxReports` | required | Recent report rows in the session projection. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

Only marked main-loop `llm/stream` requests establish baselines. Auxiliary reviews, suggestions, side chats and compaction do not participate. The DeepSeek adapter offers a lazy content-free summary after Files/inline conversion and extension serialization. Diagnostics retain bounded hashes in memory and persist only route, counts, observation level and cause categories. Usage chunks are cumulative: the last value replaces earlier values. Input, cache-read and cache-write buckets are disjoint; absent buckets are never replaced with zero.

[The implementation](src/index.ts) owns reversible registrations and [composition tests](tests/composition.spec.ts) exercise the Loader and real services with external model or network fixtures.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [W1 rollout and acceptance](../../../docs/Harness三阶段改造.md)
- [Session persistence changes](../../../docs/cookbook/reviewing-persistence-type-changes.md)
- [Local development](../../../docs/开发与上游维护.md)

-----

<a id="model-experience"></a>
## Model Experience

### Passive request observations

#### What the model sees

The plugin adds no model-visible messages, tool schemas or instructions. `w1/cache-diagnostic` records have no conversation surface operation.

#### Token effect

Zero direct token effect and no auxiliary model calls.

#### KV Cache effect

The observer forwards the original frozen request and stream. It compares existing message prefixes, so appended messages alone do not count as rewrites. Bounded or unavailable comparisons remain unknown.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Server cache keys, eviction and TTL are unknown. A suspected miss is an observation, not proof of a harness or provider defect.
- C2 is available only on the native DeepSeek Messages adapter. SDK adapters remain C1 unless they add an equivalent observation.
- The dialog shows the last retained main-loop step in that turn. Restart or baseline eviction starts a new comparison baseline.

<a id="dev-note"></a>
### Dev Note

None.
