# W1 内置通知

W1 的 Windows 任务提醒属于默认应用组成，入口为「设置 → 通知」，无需安装通知插件。客户端只决定任务提醒策略，Electron 主进程负责 Windows 系统通知、任务栏高亮和未读角标；不再启动 PowerShell/C# 辅助程序。手机后台推送不属于本模块。

## 行为

提醒任务结束、出错、等待审批、等待回答。任务结束也包含手动停止；普通子代理结束不提醒。完成和待处理事件延迟 500 毫秒并重新确认，错误覆盖普通完成，过期审批、继续运行和会话移除会撤销过时提醒。重新连接只建立当前状态，不把历史空闲状态当作新完成。

默认只在 W1 处于后台时弹通知；点击通知显示 W1 并打开对应会话。未读数在当前客户端内存中保存，仅前台实际打开某个会话时清除该会话计数。任务栏高亮不抢焦点，返回 W1 后停止。窗口关闭到托盘仍可提醒；完全退出 W1 后不再产生通知，不承诺已退出应用的通知点击能恢复对应会话。

设置包括总开关、四类事件、系统通知、后台限制、任务栏高亮、未读数字和会话标题。默认正文不含模型回复、错误细节、审批内容或会话标题；旧设置明确允许标题时保留该选择。设置页提供系统通知、高亮、角标测试与投递状态。系统返回 show 不等于用户一定看见横幅，Windows 勿扰模式仍有影响；程序不修改系统权限。

## 存储与迁移

偏好使用当前 W1 页面 localStorage 的 w1.notifications.preferences.v1；首次读取兼容旧 dsh-task-notifier.preferences.v1，后续修改写入新键。原键保留。scripts/w1/migrate-notifications.mjs 只接受名为 .w1-harness 的私有目录，备份 profile 清单与锁文件后移除旧通知 bundle 的加载项，保留旧插件文件、不更改会话与模型凭据；Start-W1.ps1 在旧 W1 进程已退出后执行迁移。

本机迁移备份：C:/Users/luciu/.w1-harness-backups/notifications-builtin-2026-10-18T09-58-51.455Z。回退时正常退出 W1，从备份恢复私有 profile/package.json 与 pnpm-lock.yaml，同时恢复未启用本模块的代码，避免两套提醒重复运行。原版 .dsh 未参与迁移。

## 开发和验证

运行 node packages/w1/notifications/build.mjs 生成客户端模块；桌面局部构建也自动执行此步骤。运行 node --test packages/w1/notifications/test/notifications.test.mjs 验证事件策略、设置绑定和迁移。默认 web-app 引用本模块；只有存在桌面 notifications bridge 时才激活，因此普通网页不请求 Windows 提醒。

2026-10-18：Electron 原生独立投递收到 show/close 且用户确认看见；切换到内置模块后，W1 设置页面再次通过实际桌面 bridge 发出测试通知并收到 Windows 已报告显示。侧栏手机连接入口打开设备页且中继在线。业务事件、子任务过滤、重复与过期事件、偏好兼容和迁移经过定向测试；未用真实付费模型制造任务，任务结束后的长期日常表现、Windows 通知中心点击及任务栏视觉细节继续在使用中验收。

## 实现入口

- src/state.js：提醒去重与未读状态，沿用 rc.4 已验证的策略。
- src/client.js、src/settings.js：事件订阅、可观察设置数据和设置页面。
- apps/desktop/src/w1-notifications.ts：原生通知与任务栏，主窗口/top-frame IPC 校验由 main.ts 统一执行。
- scripts/w1/migrate-notifications.mjs：W1 专用备份迁移，不删除旧插件文件。

参考：[Electron 通知](https://www.electronjs.org/docs/latest/tutorial/notifications)。
