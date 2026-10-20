---
description: "W1 产品扩展与文档归属。"
kind: "package-group"
---

# packages/w1

[English](README.md) | 中文

## 概览

W1 扩展通过既有插件框架提供产品专属对话、浏览器、通知、用量和任务流程能力。

## 目录

- [包](#packages)
- [开发备注](#dev-note)

<a id="packages"></a>

## 包

各功能 README、兼容和验证状态见[产品说明](../../docs/W1-Harness.md)。[工具](../../docs/subsystems/tools.zh.md)、[LLM](../../docs/subsystems/llm-streaming.zh.md)和[会话](../../docs/subsystems/session.zh.md)继续维护这些扩展使用的共享运行接口。

<a id="dev-note"></a>

## 开发备注

用量与通知使用独立 JavaScript 构建；TypeScript 扩展使用工作区普通构建。产品打包纳入它们的私有依赖，无需发布到 npm。
