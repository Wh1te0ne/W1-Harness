# W1 Harness

[English](README.md) | 中文

<img src="assets/w1/exports/app-icon-light-128.png" alt="W1 Fold 标志" width="80">

**面向编程、研究和日常任务的个人 AI 工作区，基于 DeepSeek Harness 开发。**

[下载发行版](https://github.com/Wh1te0ne/W1-Harness/releases) · [产品说明](docs/W1-Harness.md) · [远程部署](apps/w1-remote/README.md) · [参与贡献](CONTRIBUTING.zh.md) · [MIT 许可](LICENSE)

W1 Harness（W1H）是独立衍生产品，保留 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Cordis 插件架构，拥有独立桌面身份、产品发布和用户数据。它并非 DeepSeek 官方应用。

## 当前状态

W1H 处于早期开发预览阶段，桌面维护目标为 Windows x64。部分功能已有隔离运行证据，仍需扩大真实设备验证，具体见[版本说明](CHANGELOG.md)。macOS 和 Linux 保留上游源码，尚无 W1 二进制支持承诺。

## 功能

| 领域 | 可以做什么 |
| --- | --- |
| 工作区 | 为项目设置多个目录与主要目录，在本地保留聊天与产物。 |
| 模型 | 使用自己的供应商凭据，无需 DeepSeek 账号即可进入工作区。 |
| 任务流程 | 通过插件框架使用目标、计划、审批、工具和子智能体。 |
| 对话 | 获得可编辑回复建议，打开侧聊，查看用量并自定义外观。 |
| 浏览器 | 操控内置浏览器，或通过 W1 Chrome 扩展连接既有标签。 |
| 通知 | 接收 Windows 通知、未读标记和任务栏提醒。 |
| 远程 | 通过自行部署的加密 WebSocket 中继配对 Android 客户端。 |

浏览器操控遵守当前授权和聊天归属。手机访问要求电脑保持运行；中继只转发消息，模型、凭据、文件和任务执行留在电脑。

<a id="run"></a>

## 安装与更新

从 [W1H Releases](https://github.com/Wh1te0ne/W1-Harness/releases) 下载 Windows x64 安装器。当前预览安装包未进行代码签名。使用时配置自己的模型 API Key，下载包不含凭据。

W1H 和 DSH 使用独立版本与更新操作：

| 入口 | 用途 |
| --- | --- |
| 检查 W1H 更新 | 查看 W1H 版本说明，下载校验后的程序包，再确认安装并重启。 |
| DSH 上游更新 | 查看源码发布并复制开发任务；整合仍需开发与验证。 |

Windows 托盘菜单同时提供两个入口。「关于」显示 W1H 版本、已整合 DSH 基线和构建信息。源码版发现发行版时不会覆盖开发仓库。在源码版、测试版和安装版之间切换前，请阅读[版本与环境](docs/版本与发布.md)。

## 组成与部署

| 组件 | 说明 |
| --- | --- |
| 桌面与 Host | [开发工作流](docs/开发与上游维护.md) |
| Android 客户端与 Docker 中继 | [构建、部署、配对与限制](apps/w1-remote/README.md) |
| Chrome MV3 扩展 | [安装与权限](packages/w1/chrome-use/README.zh.md) |
| W1 插件 | [产品文档](docs/W1-Harness.md) |

在 `apps/w1-remote/` 使用 Docker Compose 部署中继，配置自己的 HTTPS 域名与 WebSocket 转发。[远程运维](docs/远程访问与NAS中继.md) 说明检查和恢复。Chrome 扩展通过可解压加载的 ZIP 发布，尚未上架 Chrome 应用商店。

<a id="run-from-source"></a>

## 开发

使用 Node.js `^22.19.0 || >=24.0.0`，pnpm 版本以 `package.json` 为准，Windows 使用 PowerShell 7。

```powershell
git clone https://github.com/Wh1te0ne/W1-Harness.git
cd W1-Harness
corepack pnpm install --frozen-lockfile
corepack pnpm run build
```

桌面准备与源码启动见[本机开发](docs/开发与上游维护.md)。首次完整构建后，只构建涉及的模块。发布打包独立于日常开发。

保持负责开发的 W1 实例与它构建的候选程序分开。测试配置具有独立数据与身份，真实 API Key 放在 Git 之外。见[自开发与测试](docs/版本与发布.md)。

## 路线图

后续工作与验收状态见[项目规划](docs/项目规划.md)。重点为可复现发布、扩大桌面与 Android 验证，以及浏览器可靠性。列出组件或测试通过不代表所有原生流程均已验收。

## 反馈与安全

W1H 问题与建议请提交到本仓库的 [Issues](https://github.com/Wh1te0ne/W1-Harness/issues)，提供 W1H 版本、DSH 基线、环境与复现步骤。请阅读[贡献说明](CONTRIBUTING.zh.md)和[安全报告](SECURITY.md)，移除 Key、配对码、私人聊天和私密文件内容。

## 许可与上游

W1H 采用 [MIT 许可](LICENSE)，保留 DeepSeek 版权声明。Cordis、运行时、字体和其他依赖继续使用各自许可。[上游架构](docs/architecture.zh.md)与 [vendor 说明](vendor/README.md)提供技术参考和归属。
