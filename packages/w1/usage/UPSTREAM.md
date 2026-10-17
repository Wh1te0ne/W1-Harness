# 上游与修改范围

- 原项目：[Han-1413141/dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter)，MIT，原版权声明完整保留在 `LICENSE`。
- 基线：`1.8.24`，提交 `bd9cac6f85d0499eadd6733b347330a00e19ad17`（2026-10-13）。
- 2026-10-14 核验：本机已安装包的 `lib/index.js`、`lib/pricing.js`、`lib/client.js` 与上述源码的文件 SHA-256 一致。
- 已安装目录仅用于只读核对：`C:\Users\luciu\.dsh\profiles\desktop\node_modules\dsh-cost-meter`。没有修改其内容或复制用户数据。

这是由用户独立维护的派生项目，不代表原作者发布。`0.1.0` 使用包名 `dsh-cost-meter-custom`；从 `0.1.1` 起正式命名“用量管家 / Usage Manager”，包名 `dsh-usage-manager`。为兼容此前数据，账本目录保留 `cost-meter-custom`。继承的文档、测试和维护脚本保留原项目背景，不用于自动发布；本项目使用 README 中的验证与打包命令。

主要改动：独立命名与账本；手填费率层和公共模型目录；设置导航及折叠面板；OpenRouter 自动更新开关；移除三种首次使用指导浮窗；新增设置按需加载；新增计价测试与纯模拟数据预览。

实现索引：

- `lib/manual-prices.js`：精确匹配、输入验证、币种和费率结构。
- `lib/pricing.js`、`lib/store.js`、`lib/typert.host.js`：计费入口、配置持久化、RPC 数据契约。
- `lib/configured-models.js`：公共模型元数据，按服务缓存 60 秒，每个来源最多等待 1.5 秒；失败来源不阻断其他来源。
- `src/custom/index.js`：精简设置和手填表单，沿用原版样式和功能组件。
- `src/client/03-custom-settings.js`：官方模块加载包装；其余 client 片段保留原版核心 UI。
- `scripts/build.mjs`：保留原版压缩构建与字典无损回读验证，额外输出 `client.custom.js`。
- `scripts/build-runtime-deps.mjs`、`lib/vendor/`：0.1.2 起提供本地链接安装所需的自包含 Host 依赖；许可证与版本见 `THIRD_PARTY.md`。
- `scripts/check-package.mjs`、`scripts/check-host-activation.mjs`：实际导入成品与隔离的真实 Cordis 挂载验证。

本次 REA 只读分析证据：`ev_77cc837c4acddc8df2c989731d09c99ac7b28857fcc6c39027264d39759250c9`，父证据 `ev_cb1b353d1e316bd91dca9ee125d01b78b452b94f98f6bdd1ab305c2b0d46aa50`。该图包含依赖且语义覆盖部分截断；功能结论以定点源码核对和测试为依据，静态分析不代表真实运行验收。
