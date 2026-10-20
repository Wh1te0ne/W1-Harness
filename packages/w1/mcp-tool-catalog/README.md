---
description: "Configure or debug W1 mcp-tool-catalog behavior, limits, persistence, and validation."
kind: "package-reference"
---

# @deepseek-ai/dsh-w1-mcp-tool-catalog

English | [中文](README.zh.md)

## Summary

Models can search available MCP operations and load only the calling declarations they need. W1 retains existing execution permissions and remembers selected schemas per session. This reduces initial Native declaration input when many MCP operations are registered.

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
- name: '@deepseek-ai/dsh-w1-mcp-tool-catalog'
  config:
    enabled: true
    maxResults: 12
    maxResponseBytes: 16384
    maxLoadedTools: 128
    maxLoadedBytes: 262144
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Enable this policy. |
| `maxResults` | required | Search entries per page. |
| `maxResponseBytes` | required | Complete response byte limit. |
| `maxLoadedTools` | required | Disclosed operations per session. |
| `maxLoadedBytes` | required | Complete disclosed-schema array byte limit. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The plugin filters the final scoped `system-prompt/assemble` tool list. Runtime-only MCP origin metadata preserves the real server and raw operation name, independent of public-name normalization. `w1_tool_catalog` searches that permitted directory; load records exact identities and schema fingerprints before returning. The existing loop logs declarations in request headers and tool history. Disconnects, schema changes and permission changes are revalidated; failed persistence withholds the pending declaration.

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

### Catalog tool schema

#### What the model sees

The model sees `w1_tool_catalog(action=search|load, query?, offset?, names?)`. Search returns bounded names and descriptions; load acknowledges exact public names and makes their schemas available on the next step. The [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-w1-mcp-tool-catalog) owns the complete declaration.

#### Token effect

One catalog schema is present initially. Search results and selected operation schemas add conditional tokens; disclosure does not remove execution permissions.

#### KV Cache effect

Selected declarations remain loaded within a session while their identity, schema and scope remain valid. Existing native tool-history support appends changes; other routes use their existing header-reset behavior.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- PTC SDK descriptions, server startup and MCP server instruction sections are unchanged. Presets without access to the catalog retain their original declaration list.
- Scope restrictions remain authoritative at execution. A disclosed name is never an execution grant.
- Search uses word matching rather than a semantic embedding index. Large selections require a narrower session or an explicit limit change.

<a id="dev-note"></a>
### Dev Note

None.
