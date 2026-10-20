---
description: "W1 Desktop 的产品级工具选择与浏览器环境选择指引。"
kind: "package-reference"
---

# @deepseek-ai/dsh-w1-tool-selection

[English](README.md) | 中文

## 概述

W1 Desktop 挂载本 Cordis 插件，引导模型在用户任务范围内选择工具。覆盖专用工具、文件、Shell、搜索、网页读取、技能与浏览器环境，不增加工具或权限。浏览器操作步骤由 [browser-use](../browser-use/README.zh.md) 维护。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

Desktop Host 自动在现有提示词与工具服务旁挂载本插件；没有配置项或单独安装命令。用户描述任务即可，无需指定工具名。明确目标、只读要求以及不做浏览器或桌面验收的限制，优先于主动使用工具的指引。

| 任务 | 选择指引 |
|---|---|
| 明确指定浏览器或标签页 | 遵守指定目标；目标不可用时说明，不静默切换 |
| Localhost、前端渲染或交互 | 使用可用的内置浏览器，复用当前聊天的相关标签页 |
| 现有 Chrome 登录状态或外部业务标签页 | 可用时使用 `w1_chrome`，检查自动连接、发现并选择相关网页，无需手动共享 |
| 资料查询或普通网页正文 | 使用搜索或读取；需要渲染或交互时使用浏览器 |
| 已支持的服务或文件操作 | 优先对应专用工具；构建、测试、进程及未覆盖的操作使用 Shell |

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>提示词组合与生命周期</summary>

[src/index.ts](src/index.ts) 通过 `ctx.systemPrompt.section` 注册 `w1:tool-selection`。无浏览器时仍提供通用指引；浏览器环境建议按作用域内 `w1_browser` 与 `w1_chrome` 的可见性提供，Chrome 工具缺失时明确说明不可用。卸载会移除段落。Desktop Host 负责挂载；本包不修改 Agent 循环、不选择模型、不改变执行守卫。

</details>

<a id="model-experience"></a>
## 模型体验

### 选择指引

#### 模型看到的内容

段落以“Choose tools proactively when they help complete the user's current task; the user need not name a tool.”开头。区分内置浏览器独立状态与用户日常 Chrome 配置，并要求使用前检查自动连接并自行选择可用标签。[内置浏览器记录](../../../snapshots/session/w1-browser-use/system-prompt.expected.md)及 [Chrome 记录](../../../snapshots/session/w1-chrome-use/system-prompt.expected.md)固定可用环境与操作流程。

#### Token 影响

指引向模型请求增加系统提示文本，不增加工具声明或主动发起额外模型请求。

#### KV Cache 影响

可见能力相同时文本稳定；作用域获得或失去任一浏览器工具时，浏览器指引变化。请求更新由既有提示词组装与 Session 日志负责。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

这些是模型指令，不是确定性路由或权限授予。模拟组合与无密钥回放验证指令送达、作用域过滤和持久化，不衡量真实模型的工具选择准确率或原生浏览器行为。[Chrome 连接与扩展](../chrome-use/README.zh.md)由独立模块维护；工具可见不代表已连接，用户暂停与其他聊天的标签占用仍会被执行层检查。本包不实现桌面操控。
