---
description: "Configure or debug W1 cache-diagnostics behavior, limits, persistence, and validation."
kind: "package-reference"
---

# @deepseek-ai/dsh-w1-cache-diagnostics

[English](README.md) | 中文

## 概述

用户可以区分请求前缀变化与“输入结构稳定但未观测到缓存读取”。用量详情将规范化请求观测标为 C1，将 DeepSeek 实际序列化请求观测标为 C2。诊断不增加模型请求，缺失计数保留为未知。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本插件与 W1 Web 服务一起加载。W1 组成明确启用该功能；独立配置的 `enabled` 默认值为 false。关闭开关可以停止行为，但仍需保留新版会话读取器。

```yaml
- name: '@deepseek-ai/dsh-w1-cache-diagnostics'
  config:
    enabled: true
    maxSessions: 32
    maxRoutes: 8
    maxMessages: 2048
    maxReports: 40
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `false` | 启用该策略。 |
| `maxSessions` | 必填 | 保留摘要基线的会话数。 |
| `maxRoutes` | 必填 | 每会话的模型与推理强度路由数。 |
| `maxMessages` | 必填 | 每条基线的消息摘要数。 |
| `maxReports` | 必填 | 会话投影中的近期报告条数。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

仅带有主循环标识的 `llm/stream` 请求建立基线。辅助复核、建议、侧聊和压缩不参与。DeepSeek 适配器在 Files/inline 转换和扩展序列化后提供惰性的无正文摘要。诊断仅在内存保留受限哈希，持久化内容仅包含路由、计数、观测级别和原因分类。用量块是累计值，最后一个值替换前值。未缓存输入、缓存读取与缓存写入互不重叠；缺失字段不补零。

[实现](src/index.ts)管理可撤销的注册；[组成测试](tests/composition.spec.ts)通过 Loader 和真实服务验证行为，仅为外部模型或网络提供固定响应。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [W1 接入与验收](../../../docs/Harness三阶段改造.md)
- [会话持久化变更](../../../docs/cookbook/reviewing-persistence-type-changes.zh.md)
- [本机开发流程](../../../docs/开发与上游维护.md)

-----

<a id="model-experience"></a>
## 模型体验

### 被动请求观测

#### 模型看到的内容

本插件不增加模型可见消息、工具声明或指令。`w1/cache-diagnostic` 记录没有对话表面操作。

#### Token 影响

直接 token 影响为零，不发起辅助模型调用。

#### KV Cache 影响

观察器转发原始冻结请求和流。它比较已有消息前缀，因此单纯追加消息不算重写。超出比较上限或不可观测时保留为未知。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 服务端缓存键、淘汰规则与 TTL 未知。疑似未命中属于观测，不证明 Harness 或供应商存在缺陷。
- C2 仅适用于原生 DeepSeek Messages 适配器。SDK 适配器在加入等价观测前保持 C1。
- 详情显示该轮仍保留的最后一个主循环步骤。重启或基线被淘汰后重新建立比较基线。

<a id="dev-note"></a>
### 开发备注

无。
