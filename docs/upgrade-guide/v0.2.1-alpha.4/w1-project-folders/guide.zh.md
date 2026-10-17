---
kind: upgrade-guide
description: W1 工作区存储版本 3 阻止旧单目录读取器清理项目会话归属。
---
# W1 项目多目录

[English](guide.md) | 中文

## 变更

W1 项目可以关联多个源目录并指定主要目录，目录变更时项目 ID 和会话归属保持稳定。工作区存储从版本 2 升为版本 3；旧版 W1 会拒绝这个版本。会话日志格式不变，原版 DSH 数据不受影响。

## 迁移

1. 从应用菜单退出 W1，再通过 [Start-W1.ps1](../../../../scripts/w1/Start-W1.ps1) 启动开发版。
2. 启动器把 %USERPROFILE%/.w1-harness/storages/workspace.json 备份至 %USERPROFILE%/.w1-harness-backups/projects-v3-<时间戳>/workspace-v2.json，再将原目录映射为各项目的主要目录，保留项目与会话 ID、排序、置顶及归档状态。
3. 在项目行菜单打开“编辑项目”，确认原目录为主要目录、旧会话仍显示。后续启动不重复改写已升级的数据。
4. 如需使用旧 W1，先退出 W1、另存当前 workspace.json，再把 v2 备份恢复至该 W1 文件。这会将项目元数据恢复到备份时点，后续项目编辑不保留；不要恢复或覆盖会话日志、凭据或原版 DSH 文件。
