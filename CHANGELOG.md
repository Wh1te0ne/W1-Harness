# W1H release notes / 版本说明

## 0.2.0

Integrated DSH baseline / DSH 基线：`dsh-v0.2.1-rc.2`。W1 now uses numbered releases without alpha/beta suffixes; existing alpha installations can update through compatible feed files. / W1 改用不带 alpha/beta 后缀的数字版本，旧 alpha 安装版通过兼容更新描述升级。

### Usage and pricing / 用量与计价

- Keep CNY amounts with per-call price and exchange-rate snapshots, including auxiliary calls; later price edits do not revalue saved consumption. / 每次调用保存人民币金额、价格及汇率快照，覆盖辅助调用；改价不重算已保存消费。
- Group prices by Provider, with separate VX Default, High and Enterprise tariffs. Sync supported prices from their actual sources; preserve manual overrides and the last valid price when synchronization fails. OpenRouter prices apply only to its own channel. / 按 Provider 分组，独立核算 VX Default、High、Enterprise；支持来源同步，手填优先，失败保留最近有效价并提示；OpenRouter 价目只用于自身渠道。
- Account for input, output, cache reads, ordinary cache writes and one-hour cache writes, supported context tiers, actual effort multipliers and optional peak/off-peak tariffs. Automatically refresh exchange rates or save a manual rate. / 计入输入、输出、缓存读取、普通及一小时缓存写入，以及已支持的上下文阶梯、实际思考倍率和可选峰谷价；支持自动汇率与手填汇率。
- Confirm price deletion, retain archived versions separately, and create a new version when restoring or recreating a price. Refresh price changes without restarting; retain historical consumption. / 删除价格需确认，已删除版本独立留存；恢复或重建使用新版本；价格修改即时刷新，历史消费保留。
- Show today's cost and tokens with navigation and model breakdowns; remove duplicate cost and peak/off-peak settings entries. Provide an explicit, backed-up historical correction tool. / 展示今日费用和 Token，支持跳转与模型明细；移除重复费用和峰谷设置入口；提供需明确执行、带备份的历史纠错工具。

### Appearance and conversation / 外观与会话

- Persist themes, light/dark palettes and custom CSS in formal settings; migrate valid browser preferences and restore saved appearance during startup. Send/stop buttons and user bubbles follow the selected palette. / 主题、明暗配色及 CSS 接入正式设置，迁移有效旧偏好，启动时恢复配色；发送、停止按钮和用户气泡跟随主题。
- Load older messages when scrolling upward, retain the reading position, and keep answered questions visible outside collapsed tool activity. Display live output-token estimates and a W1 running indicator. / 向上滚动自动加载历史并保留阅读位置；已回答问题不再被工具过程折叠隐藏；显示实时输出 Token 估算与 W1 运行标记。
- Keep approvals visible in compact cards without losing the input draft. Allow an explicitly confirmed automatic-review default for new conversations; remove an incompatible fixed review temperature. / 紧凑审批卡片保持可见且不丢输入草稿；允许确认后为新会话设置自动审查默认值；移除不兼容的固定审核温度。
- Parent the project folder chooser to the application window and simplify the project dialog. / 项目文件夹选择窗口关联应用主窗口，并精简项目弹窗说明。

### Runtime and companion components / 运行与配套组件

- Run the latest source Test build from its dedicated launcher. Apply frozen daily updates after exit, with interrupted-update recovery, directory rollback and startup diagnostics; invalidate stale runtime archives. / 专用入口运行最新源码 Test；退出后应用冻结的日用更新，提供中断恢复、目录回滚和启动诊断，并停用失效的运行归档。
- Support the Volcengine Responses reasoning format, keep automatically opened browser tabs in the background, and avoid repeated browser fallback after HTTP failures. Desktop HTTP requests use the configured system route by default. / 适配火山 Responses 思考参数；自动创建的浏览器标签保持后台；避免 HTTP 失败后反复打开浏览器；桌面 HTTP 默认使用已配置的系统路由。
- Update Chrome to 0.2.6 with the W1 Harness tab-group name and browser-compatible screenshot timeout recovery. Android 0.1.1 and its desktop counterpart show reasoning and tool results while preserving expanded details during updates. Relay remains 0.1.1. / Chrome 更新为 0.2.6，标签组统一为 W1 Harness，并修复截图超时回退的浏览器计时器兼容；Android 0.1.1 与电脑端配套显示思考和工具结果，增量更新保留展开状态；中继保持 0.1.1。

### Upgrade and validation limits / 升级与验证边界

Read the [CNY ledger upgrade guide](docs/upgrade-guide/v0.2.1-rc.2/w1-cny-pricing/guide.md), [appearance migration guide](docs/upgrade-guide/v0.2.1-rc.2/w1-theme-persistence/guide.md), and [desktop address policy](docs/upgrade-guide/v0.2.1-rc.2/desktop-web-fetch-address-policy/guide.md). Rollback of the CNY migration requires a matching application and ledger backup. Historical repricing requires a separate explicit operation; a new price does not silently rewrite old charges. / 升级前阅读[人民币账本](docs/upgrade-guide/v0.2.1-rc.2/w1-cny-pricing/guide.zh.md)、[外观迁移](docs/upgrade-guide/v0.2.1-rc.2/w1-theme-persistence/guide.zh.md)和[桌面地址策略](docs/upgrade-guide/v0.2.1-rc.2/desktop-web-fetch-address-policy/guide.zh.md)说明。人民币迁移回退需同时恢复匹配的应用和账本备份；历史重算须单独明确执行，改价不会静默改写旧费用。

Windows x64 installer; unsigned. The complete build, selected behavior tests, documentation checks, packaged runtime startup and document conversions pass. Packaged pricing and theme modules match the verified source; a synthetic legacy ledger preserves its CNY amounts after migration, exchange-rate changes and reopening. Public download evidence is recorded in the work log. Actual installer replacement, restart after installation, and companion-device acceptance have not been performed for this release. Usage estimates exclude unsupported storage-time, Batch/Flex and non-token charges. / Windows x64 安装包未签名。完整构建、所选行为测试、文档检查、包内运行时启动和文档转换通过；包内计费与主题模块与已验证源码一致，合成旧账本通过迁移、改汇率及重开后的人民币金额保持检查。公开下载证据见工作记录；本次未执行实际覆盖安装、安装后重启及配套设备验收。用量估算不含尚未适配的缓存存储时长费、Batch/Flex 和非 Token 费用。

## 0.1.0-alpha.4

Integrated DSH baseline / DSH 基线：`dsh-v0.2.1-rc.2`。

- Separate W1H product updates and DSH source-release discovery, with independent tray entries and release notes. / W1H 产品更新与 DSH 源码跟进分开，提供独立托盘入口与说明。
- Include W1 project, usage, notification, appearance, reply-suggestion, side-chat, workflow and browser improvements. / 包含既有项目、用量、通知、外观、回复建议、侧聊、流程与浏览器改进。
- Include Chrome 0.2.4, Android 0.1.0 and relay 0.1.1 sources and deployment instructions. / 纳入 Chrome 0.2.4、Android 0.1.0 和中继 0.1.1 的源码及部署说明。
- Add a separate test identity and private setup for only the official DeepSeek credential. / 新增独立测试身份及仅含官方 DeepSeek 的本机凭据准备。

Windows x64 preview; unsigned installer. Source builds retain local iteration. Public packages contain no model keys or user history. Evidence and native acceptance limits are recorded in [the work log](docs/工作记录.md). / Windows x64 预览安装包未签名；源码版保留本机迭代方式，公开包不含模型 Key 或用户历史；验证及原生验收边界见[工作记录](docs/工作记录.md)。

## 0.1.0-alpha.3 and earlier / 及更早版本

Local versions before the independent GitHub release pipeline. Historical evidence remains in [the product documentation](docs/W1-Harness.md); these records do not imply GitHub installers exist for those versions. / 独立 GitHub 发布流程前的本机版本。历史证据见[产品文档](docs/W1-Harness.md)，不表示这些版本已有 GitHub 安装包。
