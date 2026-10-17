# W1 内置用量

- 先读 README.md；只维护 W1，不修改原 DSH 或原插件工作区。
- 模块由 web-app 默认加载，保留包名和服务名以兼容历史账本；不要重新声明可安装 bundle。
- 保持无官方钱包查询，保留账本格式、模型凭据与手动价格。
- 客户端修改运行 node scripts/build.mjs；策略检查运行 node --test test/w1-policy.test.mjs。
- 实质变更更新 ../../../docs/工作记录.md；真实运行数据不得存入源码目录。
