---
description: "ctx.web 的匿名公共 HTTP(S) 抓取后端：部署方如何挂载有界、安全的 URL 抓取，含同源重定向与仅文本解码。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-fetch-http

[English](README.md) | 中文

## 概述

通过 `dsh-web-fetch-http`，harness 可经 `ctx.web` 获取匿名 HTTP(S) 文本，保留输出上限、URL 校验和同源重定向限制。严格模式验证并固定公网地址；系统模式沿用已配置网络而不进行此前置检查。两种模式均不携带浏览器 Cookie。非 2xx 响应仍作为结果而非错误返回。面向模型的 `web_fetch` 工具位于 `dsh-tool-web`。

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

在已加载 web 服务的组合中挂载本提供方；它以 `http` 抓取提供方身份注册，因此当它是唯一可用的抓取后端时，`ctx.web.fetch()` 会自动解析到它——也可以用 `fetchProvider: http` 固定。

### 何时选择

此后端用于有界的匿名文本获取。提供方默认 `requirePublicIp: true`：直接连接验证并固定公网地址，显式代理路径由已配置代理解析目标。W1 Desktop 将它设为 `false`，沿用系统 DNS、路由和已安装代理策略，不预先检查地址；真实内网目标也因此可达。其他 profile 保留严格默认值，不对特定代理产品或网段特殊处理。

### 最小配置

加载 web 服务与本提供方；可配置上限都有安全默认值，并在插件构造时验证，因此无效值会直接报错，而不是构造出上限荒谬的提供方。URL 安全上限固定为 2,048 个字符。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-fetch-http'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `requirePublicIp` | `true`（Desktop 为 `false`） | 对直接连接实施公网地址校验 |
| `maxResponseBytes` | `5,000,000` | 响应主体最大字节数 |
| `maxBodyChars` | `100,000` | 解码主体最大字符数 |
| `timeoutMs` | `30,000` | 抓取超时——资源兜底，不是面向模型的工具预算 |
| `maxRedirects` | `5` | 同源重定向最大跳数（`0` 表示不跟随） |
| `userAgent` | `deepseek-harness/…` | 每次请求发送的 `User-Agent` 标头 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-fetch-http)是每个受支持字段及其 JSDoc 的穷尽式真源。在 profile 的 `cordis.patch.yml` 的 `web-fetch-http` 行或该插件现有设置命名空间中，设 `requirePublicIp: true` 即可启用严格模式；用户设置优先于 bundle 默认值。动态修改从下一次读取生效，正在进行的读取及其全部重定向保持同一策略。

### 抓取返回什么

成功调用产生 `WebFetchResult`：允许的重定向之后的最终 URL、HTTP 状态码、分类为 `html` 或 `text` 的解码正文，以及 `truncated` 标志。非 2xx 响应是结果而非错误——状态码是被抓取资源状态的一部分；`WebError` 只用于无法安全获取或表示资源的失败。

```text
const page = await ctx.web.fetch({ url: 'https://example.com' })
// page.body.kind === 'html' | 'text'; page.statusCode === 200 | 404 | ...
```

### 传输行为

提供方保持请求匿名且有界：只接受不含内嵌凭据且不超过 2,048 个字符的 `http:` 与 `https:` URL。它只解析一次主机名；只要结果中有任何 IPv4 或 IPv6 地址不是公共单播地址，就拒绝整个结果，并把连接固定到已校验的地址集合。IPv6 检查会发现活动 DNS64 前缀，并拒绝指向非公开 IPv4 的转换地址。每次同源重定向都会重复解析与固定；跨源重定向会失败并要求重新调用。提供方还强制执行字节、字符、跳数和时间上限，拒绝不支持的内容类型，并发送显式产品 `User-Agent`。

### 失败与恢复

失败会抛出 `WebError`，其中包含可供程序路由的错误码：`WEB_INVALID_URL`、`WEB_BLOCKED_URL`、`WEB_FETCH_TOO_LARGE`、`WEB_FETCH_TIMEOUT`、`WEB_REDIRECT_BLOCKED`、`WEB_UNSUPPORTED_CONTENT_TYPE`、`WEB_ABORTED` 或 `WEB_PROVIDER_ERROR`。直接调用方可以按错误码路由；面向模型的 `web_fetch` 工具会在自己的错误包装层内把失败文本呈现给模型。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释提供方背后的设计决策；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

本包基于一项职责分离和一套分层超时机制：

- **安全获取与呈现分离。** 本提供方拥有 URL 校验、公开地址强制规则、连接固定、HTTP 传输、重定向策略、上限、charset 解码与二进制拒绝；`dsh-tool-web` 拥有 HTML→markdown 与截断格式化。非 2xx 响应是数据，不是失败。
- **两层超时。** 提供方的 `timeoutMs` 是直接 `ctx.web.fetch()` 调用方的资源兜底；面向模型的工具调用预算属于 `dsh-tool-call-timeout-policy`，由它触发 `exec.signal`。外层截止期限先到时，提供方报告 `WEB_ABORTED`，策略再以 `TOOL_TIMEOUT` 替换；因此 `WEB_FETCH_TIMEOUT` 标识的是提供方预算耗尽的直接服务调用方。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、上限验证、提供方注册 |
| [`src/provider.ts`](src/provider.ts) | `HttpFetchProvider`：固定连接、重定向跟随、有界读取、charset 解码 |
| [`src/network.ts`](src/network.ts) | 公开地址解析、DNS64 发现与连接固定 |
| [`src/policy.ts`](src/policy.ts) | URL 校验、同源检查、内容类型分类、charset 解析 |

### 读取路径

抓取先校验 URL，再选择传输。严格模式的直接连接只解析一次、拒绝非公网结果并固定已接受地址；显式代理仍由代理解析目标。系统模式使用已安装的进程 dispatcher，不执行此前置检查。每次重定向都遵守选定策略，两种模式均拒绝跨源重定向。响应继续受到内容类型、字符集、字节和字符上限约束。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从共享词汇逐步进入服务、面向模型的工具与设计依据。

- [web 子系统](../../../docs/subsystems/web.zh.md)——穷尽式的抓取请求／结果词汇与错误码。
- [web 包映射](../README.zh.md)——六包家族与各角色。
- [dsh-web](../web/README.zh.md)——本提供方注册进入的 web 服务。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染本提供方正文的面向模型 `web_fetch` 工具。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-fetch-http)——每个受支持配置字段及其源声明。
- [web 能力 seam 决策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜索与抓取为何共用一项提供方选择服务。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过 `dsh-tool-web`：该工具把本提供方经 `maxBodyChars` 限制的解码文本或由 HTML 转换得到的 markdown 置于抓取结果包装层内，而重定向、标头与传输上限保持隐藏。

#### KV Cache 影响

不会直接导致 KV Cache 失效；请求前缀变更由上述消费方负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明提供方何时不安全或不合适。它们是当前包约束。

- **只解码文本内容**——包括 html/xhtml 与 `text/*` 加 JSON/XML 家族；缺少 `Content-Type` 或任何二进制类型都会抛出 `WEB_UNSUPPORTED_CONTENT_TYPE`，可提取文本的 PDF 解码属于明确的延期工作。
- **charset 只来自 `Content-Type` 标头**（默认 UTF-8）——HTML `<meta charset>` 声明会被忽略；声明但无法识别的 charset 标签会抛出异常，而非回退。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
