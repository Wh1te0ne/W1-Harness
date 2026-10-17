# W1 内置用量

[English](README.md) | 中文

W1 的应用功能模块，侧栏“用量”与“插件”“自动化任务”同级。页面提供总览、用量明细、模型价格和设置，复用原有 Token、费用估算、预算、会话统计和历史账本。官方 DeepSeek 余额与钱包授权继续关闭；模型 API Key 仍由 W1 凭据库管理。

应用的 packages/bundle/web-app/cordis.patch.yml 默认加载本模块；它不再声明 dsh.bundle，也不作为用户可选插件安装。包名 dsh-usage-manager、usageManager 服务名、usageManagerUsage 投影名和账本路径保持不变，以避免数据迁移或重新计费。代码仍通过 Cordis 模块注册，与 W1 其他内置功能采用相同机制。

数据位于 W1 的 DSH_HOME/storages/cost-meter-custom，旧私有插件副本仅保留用于回退。启动脚本 scripts/w1/migrate-usage.mjs 在 W1 停止时备份 profile 与账本，移除外部 dsh-usage-manager 和未启用的旧 dsh-cost-meter 安装记录，再由应用内置组成接管；不删除旧副本或修改账本。

运行 node scripts/build.mjs 只重建浏览器模块；Host JavaScript 和 lib/vendor 中的原有打包依赖随源码维护，tsdown.config.ts 避免通用打包器覆盖这些源文件。开发环境刷新链接使用 scripts/w1/Start-W1.ps1 -RefreshProject，日常启动可直接使用桌面快捷方式。无需生成安装包。

沿用 Cost Meter 的 MIT 许可，归属与第三方许可见 LICENSE、UPSTREAM.md、THIRD_PARTY.md。W1 差异包括官方钱包关闭策略、独立主页面与默认应用装配；上游更新时保留这些行为。用量页使用与会话费用相同的可观察数据源，注册随模块卸载释放，不新增第二套计费监听。
