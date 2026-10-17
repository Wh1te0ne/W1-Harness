---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-17-w1-reply-suggestions

[English](2026-10-17-w1-reply-suggestions.md) | 中文

## 概述

新增 W1 回复建议的辅助请求、缓存模型选择及可选建议记录。这些记录不进入主对话上下文，也不发送用户消息。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

旧会话继续可读，默认无建议与缓存路由。新版识别三个带独立事件名的日志记录；不识别这些必需事件名的旧读取器会拒绝重建相关会话，避免静默误读。既有事件负载未变，逻辑格式版本保持不变。应用回退应保留新版读取器，或恢复升级前的私有会话备份。

<a id="verification"></a>
## 验证

Loader 组合的真实 agent-loop 测试 4 项通过，覆盖主模型选择、路由复用、不自动输入、取消与卸载；输入框和快捷键测试 136 项通过，覆盖 Tab 只填入、另按 Enter 发送、Esc、组合键和中文输入法。

<a id="dev-note"></a>
## 开发备注

无。
