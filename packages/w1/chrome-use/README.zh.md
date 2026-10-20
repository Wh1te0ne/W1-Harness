---
description: "W1 的 Chrome 自动连接、标签发现与按聊天归属的操控能力。"
kind: "package-library"
---

# @deepseek-ai/dsh-w1-chrome-use

[English](README.md) | 中文

## 概述

安装并启用扩展后，Chrome 自动连接 W1。模型发现普通网页标签，选择相关页面或打开后台标签，沿用 Chrome 已有登录状态。无需连接码或手动共享标签。面板显示状态，提供全局和逐页暂停。原生验收仍待进行。

## 目录

- [使用本库](#use-this-library)
- [连接与操控](#connection-and-control)
- [实现](#implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-library"></a>
## 使用本库

Desktop Host 与扩展在本机回环端口 17832–17839 内自动选择对应服务，无需用户设置端口；桌面不再使用保存的手工端口或 W1_CHROME_BRIDGE_PORT。连接等待五秒，命令期限为 30 秒。服务随 Host 启动，全部发现端口占用时报告失败。[browser-use](../browser-use/README.zh.md) 在既有浏览器提供方内注册 `w1_chrome`。本库不是单独安装的 Cordis bundle。

### 安装或更新，原生验收待进行

1. 安装不要求 W1 运行。在 `chrome://extensions` 开启开发者模式，用 `releases/w1-chrome/0.2.4/` 替换旧的解压扩展。旧发布目录保留不变。
2. 扩展使用 `tabs`、`tabGroups`、`debugger`、`storage`、`alarms`，以及仅限 `127.0.0.1` 的 HTTP 主机访问来检查服务就绪。W1 关闭时面板等待，不创建 WebSocket，也不发现页面。
3. 要使用浏览器操控，完全退出并从正常快捷方式重开 W1，应用配套 Host 更新，然后保持两者运行。就绪后扩展自动连接，无需连接码或共享当前标签。
4. 让 W1 使用某个已有 Chrome 页面。模型列出标签，必要时按标题/网址筛选，自行选择目标并验证操作。安装扩展不授权无关后台任务或未请求的外部变更。

### 构建

`node --import tsx/esm scripts/w1/build-chrome-extension.mjs` 生成不可覆盖的解压版本目录和校验清单，不安装、不打开 Chrome。`--stage-only` 使用 `.work/chrome-extension/` 临时目录。0.2 版使用协议 2，不兼容已停用的邀请协议；Host 与扩展需一起更新，见[升级说明](../../../docs/upgrade-guide/v0.2.1-rc.2/w1-chrome-auto-connect/guide.zh.md)。

<a id="connection-and-control"></a>
## 连接与操控

启动与工作线程唤醒读取已保存的启用状态，并自动发现就绪的本机端点。有期限的 HTTP 就绪检查先于 WebSocket 创建及最多 200 个普通 HTTP/HTTPS 标签的发现。Host 关闭属于正常等待状态，使用有界退避重试，闹钟提供唤醒后备；已连接时用心跳维持。操作不重放。全局暂停跨工作线程重启保留并立即停止待执行输入。逐页暂停在当前工作线程内跨传输重连保留，工作线程重建后重置。0.2.4 需要 Host 的就绪端点，旧 Host 在更新前保持不可用。

桥接只接受固定扩展来源、精确的本机回环 Host/路径及带版本的消息。扩展只接受自己面板或已建立本机桥接的控制消息。浏览器内部页、无痕标签、含凭据的网址及超限消息会被拒绝。连接设置不包含账号凭据。Chrome 保留正常登录状态，W1 不读取浏览器配置文件。

列表提供有界的页面元数据。模型操作会在桥接两端将目标标签归属到实际 Agent Session，其他聊天在释放前不能操作同一页。`disconnect` 只释放调用聊天的占用，扩展继续为其他聊天连接。支持普通跨站导航和新建后台标签。模型不能解除用户暂停；用户取消 Chrome 调试提示时，该标签暂停，不会静默重新附加。

<a id="implementation"></a>
## 实现

实际使用的页面加入其原窗口内的蓝色 W1 标签组，列出标签不会整理无关页面；释放控制后页面与分组保留。固定标签会被明确拒绝，不自动取消固定。src/tab-groups.ts 按窗口串行创建分组，重连后复用。点击结果区分指令已发送、目标收到可信点击、尚未验证的页面结果。后台截图使用有界渲染视口和五秒期限，超时分离调试器并清除忙操作；清理失败则暂停该页。不会激活前台标签，也不会自动重放输入。

工具栏与扩展管理卡片均使用 W1 深底应用图标，确保白色 Fold 在明暗背景上都可见。本机 HTTP 服务已响应但就绪接口不兼容时，明确提示完全退出并重开 W1，不再只显示泛化的等待状态。就绪端点只返回应用标识和协议版本，不返回标签元数据。独立 Chromium 验证覆盖 Host 关闭时安装、启动后自动连接及关闭后恢复等待，扩展错误记录均为零。

`src/bridge.ts` 负责监听、聊天占用、期限与待处理调用；`src/controller.ts` 负责发现标签和固定 CDP 操作；`src/connection.ts` 负责自动重连与偏好；`src/worker.ts` 核验面板来源。页面函数与 [browser-use/page](../browser-use/src/page.ts) 共用，在主框架隔离世界执行，不接受模型提供的脚本或协议方法。面板沿用 W1 标志和系统中英文字体，支持明暗主题。

<a id="model-experience"></a>
## 模型体验

本库只提供传输，模型工具由 browser-use 维护，不独立提供模型上下文。

#### KV 缓存影响

传输库不增加独立模型请求或提示；工具观察沿用 browser-use 的上下文与缓存行为。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 每个运行中的 W1 Host 同时连接一个 Chrome 配置。扩展以解压目录交付，未上架 Chrome 商店。要求 Chrome 116 或更高版本，兼容依据为[工作线程 WebSocket](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)及[调试 API](https://developer.chrome.com/docs/extensions/reference/api/debugger)。DevTools 或受管浏览器策略可能阻止调试。不支持密码输入、上传下载、跨来源框架定位、Shadow DOM 发现或任意 JavaScript。源码/回环测试、构建工作线程检查及隔离面板截图不代表原生安装、实际 Chrome 交互或真实模型质量验收。
### 开发备注

验证证据与待原生验收事项见 [W1 工作记录](../../../docs/工作记录.md)。
