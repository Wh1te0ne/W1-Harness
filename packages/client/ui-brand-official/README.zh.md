---
description: "使用既有 Fold 图形的 W1 Harness 侧栏与会话首屏品牌填充。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 概述

在 W1 仓库中，本包用既有 Fold 标志和 W1 Harness 名称填充侧栏及会话首屏。DSH_CLIENT_TITLE 为 W1 Harness 时启用注册。本包没有运行时状态，也不影响模型请求；保留上游包身份，便于维护衍生产品。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 W1 部署的浏览器插件名单中挂载本插件。本地和打包构建均由 W1 产品元数据提供客户端标题。

### 选择 profile

`DSH_CLIENT_TITLE` 选择此衍生产品的呈现。取值为 W1 Harness 时注册侧栏标志、名称和会话首屏标志；其他标题保留声明的回退组件。两种情况下插件都会加载。

### 替换品牌

经确认的图形与导出物按 [W1 品牌规范](../../../docs/W1品牌规范.md)固定 W1 Brand 版本。展开侧栏呈现完整的 160 × 48 横排 W1/HARNESS Logo，独立名称填充为空；收起侧栏与会话首屏保留未改形的家族母标。显式深浅色 SVG 图片跟随应用实际主题，包括手动选择；每张图片隔离自己的 mask ID。HARNESS 字标不依赖系统字体重新绘制。品牌素材遵守[其独立授权](../../../assets/w1/LICENSE)。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

声明感知的 `ctx.slots.inject()` 注册等待侧栏与首屏 slot，声明或插件卸载时撤回。浏览器半部是 [`src/client/index.ts`](src/client/index.ts)；node 半部是一个空 Loader 座位。浏览器标题仍由构建环境（`DSH_CLIENT_TITLE`）选择。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当品牌面不够用时阅读以下页面。它们从本包占据的 slot 进入渲染这些 slot 的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染其回退。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏声明 `conversation.hero.brand.mark`。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了品牌呈现的供给方式。它们是当前包约束，不是品牌设计对比或任务积压。

- **只有一组填充**——替代呈现属于占据相同 slot 的另一个 Cordis 包。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
