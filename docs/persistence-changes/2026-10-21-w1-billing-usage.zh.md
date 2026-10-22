---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-21-w1-billing-usage

[English](2026-10-21-w1-billing-usage.md) | 中文

## 概述

为 TokenUsage 增加可选的一小时缓存写入量与实际请求计费参数。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

旧 V4 记录仍可读取。cacheWrite1hTokens 缺失表示时长未知，不是零；它属于 cacheWriteTokens 的子集，不重复计入 Token 总量。缺失 billingParameters 时不能猜测动态倍率。outputConfigEffort 为 null 表示实际发出的请求中没有该字段。旧读取方忽略新增元数据，互斥 Token 桶含义和总量不变；保持 V4。历史人民币金额保留，仅凭核实依据纠错。

<a id="verification"></a>
## 验证

65 项 pi-ai 适配与计费捕获测试通过，包含本地 Anthropic SSE 经真实适配器和 BlockAssembler；价格测试验证缓存分档、请求倍率、回放、账本落盘及历史汇率。

<a id="dev-note"></a>
## 开发备注

无。
