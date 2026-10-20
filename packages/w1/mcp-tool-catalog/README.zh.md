---
description: "Configure or debug W1 mcp-tool-catalog behavior, limits, persistence, and validation."
kind: "package-reference"
---

# @deepseek-ai/dsh-w1-mcp-tool-catalog

[English](README.md) | 中文

## 概述

模型可以搜索可用的 MCP 操作，只加载需要的调用声明。W1 保留既有执行权限，并按会话记住已选择的声明。在 MCP 操作较多时，这会减少首次 Native 请求中的声明输入。

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
- name: '@deepseek-ai/dsh-w1-mcp-tool-catalog'
  config:
    enabled: true
    maxResults: 12
    maxResponseBytes: 16384
    maxLoadedTools: 128
    maxLoadedBytes: 262144
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `false` | 启用该策略。 |
| `maxResults` | 必填 | 每页搜索条数。 |
| `maxResponseBytes` | 必填 | 完整返回结果的字节上限。 |
| `maxLoadedTools` | 必填 | 每会话已披露操作数量。 |
| `maxLoadedBytes` | 必填 | 全部已披露声明数组的字节上限。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

插件过滤最终按作用域组装的 `system-prompt/assemble` 工具列表。仅运行时使用的 MCP 来源元数据保留真实服务名和原始操作名，不依赖公开名称的规范化。`w1_tool_catalog` 搜索权限范围内的目录；load 返回前记录精确身份与声明指纹。既有循环将声明写入请求头和工具历史。断线、声明与权限变化都会重新核验；持久化失败时不会披露在途声明。

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

### 目录工具声明

#### 模型看到的内容

模型看到 `w1_tool_catalog(action=search|load, query?, offset?, names?)`。search 返回受限的名称和简介；load 确认精确公开名称，并在下一步提供对应声明。[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-w1-mcp-tool-catalog)维护完整声明。

#### Token 影响

初始提供一个目录声明。搜索结果和选中的操作声明按需增加 token；声明披露不会改变执行权限。

#### KV Cache 影响

身份、声明和作用域有效时，同一会话内保留已加载声明。已有的原生工具历史能力追加声明变化；其他路由沿用其既有请求头重建机制。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- PTC SDK 描述、服务启动和 MCP 服务指令段不变。无法访问目录的预设保留原声明列表。
- 执行时仍以作用域权限为准。披露名称不构成执行授权。
- 搜索使用词项匹配，未引入语义向量索引。选择过多操作时，需要缩小会话范围或明确调整上限。

<a id="dev-note"></a>
### 开发备注

无。

### 开发备注

验证证据与待原生验收事项见 [W1 工作记录](../../../docs/工作记录.md)。
