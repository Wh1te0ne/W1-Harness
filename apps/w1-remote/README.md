# W1 远程访问与 NAS 中继

W1 Mobile 0.1.0 与连接模块/中继 0.1.1 兼容。手机客户端是本机自用 Android 客户端，和电脑 W1 的同一 Host 通信。任务、历史记录、模型 Key 与文件操作留在电脑；NAS 只转发加密消息，不运行模型。默认关闭远程连接，在电脑「设置 → 远程连接」启用、配对和管理设备，不再使用独立窗口或侧栏入口。

## 部署参数

应用中已有的中继地址属于维护者自用部署；公开源码不表示提供共享中继服务，其他使用者应自行部署并填写自己的 HTTPS 地址。

| 项目 | 值 |
|---|---|
| 公网入口 | `https://relay.example.com` |
| WebSocket | `wss://relay.example.com/v1/connect` |
| 容器 / NAS 映射端口 | `28981/TCP` |
| 反向代理后端 | `http://NAS内网IP:28981`；代理在 NAS 本机时可用 `http://127.0.0.1:28981` |
| 健康检查 | `GET /healthz`，成功返回 `{"ok":true,"service":"w1h-relay","protocol":1}` |
| 数据卷 | 无；中继不保存会话、配对密钥或令牌 |
| 运行条件 | Docker Compose，或 Node.js 24；不需要 GPU |

在 NAS 创建独立项目目录，解压中继交付包后执行 `docker compose up -d --build`，或在 NAS 的 Docker Compose 界面导入此目录。Compose 使用已有的默认 bridge 网络，不分配新子网；镜像为非 root 用户固定程序文件的读取权限，兼容 NAS 上传文件的严格权限。该服务独占 `28981`；如已有服务占用，只修改 Compose 的宿主机端口，不修改容器内部端口。初次构建需要能够拉取 Node 官方镜像及 npm 包。可通过 `docker compose ps` 和 `docker compose logs --tail=50` 查看状态。

域名入口必须有手机信任的有效 HTTPS 证书，并把整个路径转发到中继后端，保留 `/v1/connect`，开启 WebSocket Upgrade。不要把后端填写为 HTTPS；本容器的 TLS 由 NAS 反向代理终止。公网路由器只需暴露自己的 HTTPS 入口，通常为 `443`；使用自定义端口时，将端口写入中继地址。不需要把 `28981` 额外映射到公网，也不需要给电脑开放端口。长连接空闲超时建议至少 120 秒，中继每 25 秒做一次心跳。

Nginx `location /` 的对应设置如下，证书和 `listen 443 ssl` 由自己的域名入口配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:28981;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_buffering off;
}
```

部署完成后，先打开公网健康检查地址，确认返回的是 `w1h-relay` JSON，再在电脑启用远程连接。仅管理页面可访问、HTTP 404 或普通 HTTPS 成功，都不能证明 WebSocket 已可用。电脑连接前检查服务标识及协议版本，分别提示 DNS、HTTPS、健康接口/代理后端和 WebSocket 转发错误；失败后自动重连。健康检查与握手均有超时，连接成功即取消握手超时；关闭远程功能会取消正在进行的检查和重连，不影响本地会话。

## 配对与日常使用

1. 安装交付的 `W1-Harness-Mobile-0.1.0.apk`，支持 Android 8.0 及以上。它是自用 Debug 签名包；后续自用升级保持同一签名。没有上架应用商店。
2. 电脑 W1 打开「设置 → 远程连接」，确认中继地址，勾选允许连接并保存。显示「中继已连接」后生成二维码。
3. 手机点击「扫描二维码」，仅在扫描时申请相机权限。也可以手动粘贴电脑复制的配对信息。
4. 在电脑确认请求设备。二维码 5 分钟过期且确认后作废，手机保留设备绑定；以后无需重复扫码。
5. 手机查看项目和会话，继续发送文字，选择排队或立即引导，也可停止当前任务。在电脑移除设备即可撤销访问。

电脑需保持开机、联网和 W1 Host 运行。关闭手机或中继断连不会主动取消已开始的电脑任务；重新连接时读取电脑历史。手机离线不自动代发消息；未收到发送确认时保留原消息和请求 ID，手动重试沿用此 ID，避免重复提交。已有电脑会话和项目归属不迁移、不复制。

## 范围和存储

首版支持项目/会话列表、在已有项目中创建会话、历史分页、实时文字回复、工具调用与结果摘要、发送文字、停止任务、连接状态、持久绑定与撤销。文本按原内容展示，工具摘要可展开。部分过长消息会裁剪为最多 30000 字符；手机不是完整桌面轨迹查看器。

图片和文件上传下载、完整 Markdown/产物预览、系统推送、语音、远程审批和结构化问题回答暂未实现；遇到授权请求仍需电脑处理。端到端加密只覆盖手机与电脑的会话通信，设备路由标识、在线状态和流量大小对中继可见。当前是个人使用首版，没有声称完成公开多租户服务的安全审计。

电脑的设备凭据位于 `%USERPROFILE%\.w1-harness\remote\devices.json`，不进入源码或交付包；手机用 Android Keystore 加密保存配对凭据和草稿，并禁用系统应用备份。二维码包含一次性配对信息，不应公开分享或写入普通日志。更换中继地址前先解除设备绑定，避免无提示地将既有连接切换到其他服务。

协议使用 WebSocket、HKDF-SHA256 和 AES-256-GCM，按连接双方随机数派生方向独立的会话密钥，以严格递增序号拒绝重放。中继验证路由凭据、限制连接数和帧大小、执行心跳和慢客户端断开；它没有模型 API、任意文件读取或命令执行接口。手机只能调用专门限定的会话操作。

## 开发与验证

远程连接入口位于电脑设置页，经受限 IPC 调用 Host；build-desktop-ui.mjs 生成客户端模块，桌面构建会自动执行。`host.mjs` 是连接管理器；`crypto.mjs` 与 `client.mjs` 由 Node 测试和手机共用；`relay.mjs` 是独立 NAS 转发基础设施，不启动 Harness；`mobile/` 保存手机界面；`android/` 保存原生壳、相机扫码及 Keystore；电脑适配位于 `apps/desktop-host/src/w1-remote.ts`，设备管理窗口位于 `apps/desktop/src/w1-remote-window.ts`。

```powershell
# 在 W1 仓库根目录执行
node --test apps/w1-remote/tests/remote.test.mjs apps/w1-remote/tests/connection.test.mjs
node apps/w1-remote/tests/real-host-smoke.mjs
pwsh -NoProfile -File apps/w1-remote/build-android.ps1
```

手机构建脚本复用本机 SDK/JDK/Gradle，路径可由参数覆盖；不重建桌面安装包。真实组成 smoke 在 `.work/remote-composition-*` 创建隔离目录，使用确定性模拟模型，不读取生产会话或付费调用。测试与真实设备验收记录见[远程访问交付记录](../../docs/远程访问与NAS中继.md)。

## 停止和回退

先在电脑关闭远程连接；NAS 执行 `docker compose down` 可停止并移除此项目容器，不删除原 NAS 服务。客户端绑定保存在两端；恢复服务后可继续连接。撤销某台手机应使用电脑「解除绑定」，不要仅卸载手机应用。回退源码时保留 `.w1-harness/remote/` 以便恢复，不需要回退会话数据格式。

桌面设备操作通过主产品窗口的限定 IPC 调用 Host；验证发送者必须是主窗口及其主 frame，操作限定为状态、配置、配对、批准、拒绝、撤销和复制。二维码作为本地生成的图片显示，复制只写入系统剪贴板。轮询与用户操作串行，解绑需要页内确认。关闭设置停止轮询，不改变远程连接状态。
