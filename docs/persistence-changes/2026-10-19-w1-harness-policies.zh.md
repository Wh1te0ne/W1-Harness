---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-19-w1-harness-policies

[English](2026-10-19-w1-harness-policies.md) | 中文

## 概述

新增 W1 目标复核尝试、完整辅助请求与结果、MCP 声明披露以及无正文缓存观测的必需事件。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

写入格式保持 V4。新读取器完整接收旧记录；旧读取器在解释前拒绝含未知必需事件名的日志。停用功能仍保留新版读取器。复核尝试先于模型调用持久化，恢复后不自动重新调用；MCP 选择依照当前声明身份与权限范围复核。这些事件不标记为 ignorable。

<a id="verification"></a>
## 验证

8 个文件共 200 项定向测试通过，覆盖 Loader 组成、JSONL Host 重启、取消、目标过期拒绝、目标替换竞态、有界证据投影、声明与权限撤销、披露写盘失败，以及真实 DeepSeek 序列化连接本地固定响应服务。最终 24 项插件测试、局部生产与测试类型检查及修改源码 lint 通过。普通 Node 运行最终构建产物的三插件联合冒烟通过。W1 正常退出后应用四个最终暂存模块并清空队列，desktop-20261019-160013-066-64624.log 确认 host-ready 与 workspace-shown；真实模型质量与原生视觉未验收。

<a id="dev-note"></a>
## 开发备注

无。
