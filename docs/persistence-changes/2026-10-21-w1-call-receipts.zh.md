---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-21-w1-call-receipts

[English](2026-10-21-w1-call-receipts.md) | 中文

## 概述

为用量增加可选 billingCallId，使本地消费凭据能关联会话中的重复表示，避免重算历史金额或误合并同量独立调用。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

旧 V4 用量无需编号仍可读取。新读取方按已保存人民币汇总展示旧账，按固定消费凭据展示新调用；缺编号不代表零费用。旧读取方忽略可选字段，Token 计数含义不变。事件判别符与已有字段含义均不变；回退应用须保留或恢复配套账本快照。

<a id="verification"></a>
## 验证

31 项用量测试通过，涵盖凭据与合计原子落盘、独立同量调用、重复编号、并发写入、中断与缺失用量、价格汇率快照及账本/RPC/投影一致；23 项回复建议、旁路对话与接口扩展测试通过。

<a id="dev-note"></a>
## 开发备注

无。
