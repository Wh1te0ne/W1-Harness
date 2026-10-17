---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-17-w1-reply-backfill

[English](2026-10-17-w1-reply-backfill.md) | 中文

## 概述

新增逐轮回复建议尝试记录，在辅助模型工作前持久化旧会话仅补生成一次的处理状态。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

已有请求与建议保持有效，并视为已经尝试过。没有尝试记录的会话在打开时可以补生成最后一轮正常完成回答的建议。既有事件负载不变；新版识别新增事件，缺少该必需事件名的旧版安全拒绝相关会话。逻辑版本不变；回退应用需恢复私有备份或保留新版读取器。

<a id="verification"></a>
## 验证

8 项 Loader 组合测试通过，包括 JSONL 写盘、释放 Host 后从磁盘恢复且模型请求为 0、旧会话只补生成一次、失败不重试及排除中断轮次。

<a id="dev-note"></a>
## 开发备注

无。
