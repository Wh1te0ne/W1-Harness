---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-04-w1-auxiliary-message-sources

[English](2026-11-04-w1-auxiliary-message-sources.md) | 中文

## 概述

确认 w1/goal-review-request、w1/reply-request 和 w1/side-request 继承的 Message 来源扩展：action-card 归属、可选的 skill-catalog 完整性元数据和 share-viewer 用户主体。Session 写入版本保持 V4。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-04-w1-auxiliary-message-sources
baseline: false
changes:
  - root: "event:w1/goal-review-request"
    previous: "2026-10-19-w1-harness-policies"
    after: "3e3a7bf4e16230000c285b8e86015241081dd3554956c7b47bb5ec9cc3c9ed20"
    decision: same-version
  - root: "event:w1/reply-request"
    previous: "2026-10-17-w1-reply-suggestions"
    after: "1c5c35b3ac73689e9d4a54ecaf2ab4d22f3569d7beeb8876fc50e3b7082d80f1"
    decision: same-version
  - root: "event:w1/side-request"
    previous: "2026-10-19-w1-side-chat"
    after: "9aceb6a7ba88b53922602f9127c2f37579d26d0275ad9ed1dd6f7522961b428c"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

这些扩展位于已有辅助请求审计事件的 messages 数组内，事件本身只记日志。此前的消息分支仍然有效；元数据缺失时保留原有含义。当前读取器保留旧载荷，不补造新字段。旧 W1 读取器保留嵌套 JSON，不把这些审计事件变成会话消息，不据此调度辅助请求，也不根据其中复制的 principal 推导权限。回复投影只读取请求的 turn 来追踪尝试；目标复核状态忽略请求审计载荷，侧聊历史从会话事件派生，不从 side-request 记录恢复。因此，新增的 action-card 归属和技能完整性字段不会改变旧审计的回放或恢复，复制的 share-viewer 主体也不授予新权限。本次审查只涉及嵌套审计副本；实时消息准入仍由 [share-viewer 确认记录](2026-10-13-liveshare-share-viewer-principal.zh.md) 负责，[action-card 归属](2026-10-22-action-card-status.zh.md)和[技能完整性](2026-10-25-skill-catalog-incomplete.zh.md)各自的语义保持不变。事件判别字段、必需审计字段和 Session 版本均未改变。

<a id="verification"></a>
## 验证

node node_modules/vitest/vitest.mjs run packages/core/session/tests/canonical-envelopes.spec.ts --maxWorkers=2：212 个测试通过，覆盖追加、播种、恢复、接纳、快照校验、嵌套元数据保留以及纯日志事件与消息投影的区分。将三个前序记录的类型清单与当前清单进行结构审查，仅发现上文所述的继承来源变化。六份 W1 前序 schema 文件另行使用 encodePersistenceSnapshot 转换为节点表布局；每份结果重新解析后均与原完整清单逐项相等，所有根摘要保持不变，未修改确认声明或冻结检查点。Alpha 整合期间，已有 W1 目标复核、回复建议和侧聊组合检查通过，选定的三条 headless Session 回放也通过，但它们未独立覆盖每一种辅助来源分支。这里的旧读取器兼容结论依据其保留的事件处理及投影行为审查，不声称完成了旧二进制的完整降级运行。

<a id="dev-note"></a>
## 开发备注

无。
