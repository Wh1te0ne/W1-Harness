---
kind: upgrade-guide
description: W1 用量从可选插件及设置分节迁入应用默认组成与主导航。
---
# W1 内置用量

[English](guide.md) | 中文

## 变更

“用量”成为与“插件”同级的主页面，由 Web 应用默认加载；不再使用旧外部用量插件和设置分节。包名、服务标识及账本格式保持不变。

## 迁移

1. 退出 W1，通过 [Start-W1.ps1](../../../../scripts/w1/Start-W1.ps1) 启动，更新本机开发目录时加一次 -RefreshProject。
2. migrate-usage.mjs 将 W1 profile 与账本备份到 %USERPROFILE%/.w1-harness-backups/usage-builtin-<时间戳>，移除外部 dsh-usage-manager 和旧 dsh-cost-meter 的安装记录，保留私有副本用于回退。原 DSH 不受影响。
3. 点击侧栏“用量”，确认历史与模型手动价格仍在，无需再次导入历史。
4. 回退旧 W1 时先退出应用，再恢复旧应用组成、备份中的 profile 清单，并重建用量模块到旧私有副本的链接。保留当前账本，避免丢失升级后的用量。
