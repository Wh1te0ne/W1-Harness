---
kind: upgrade-guide
description: "Desktop HTTP 正文读取默认沿用系统路由，公网地址校验保留为可选项。"
---
# Desktop 网页读取地址策略

[English](guide.md) | 中文

## 变更

W1 Desktop 将 HTTP 提供方的 `requirePublicIp` 默认设为 `false`，请求使用系统 DNS、路由和已安装代理策略，包括解析为非公网地址的目标。URL 内嵌凭据及协议检查、同源重定向和响应上限保持不变。其他 profile 与直接使用提供方的调用者保留严格默认值。两种模式的显式代理路径均继续由代理解析目标。

## 迁移

1. 接受 Desktop 默认行为无需修改网络配置；已有用户设置优先。
2. 若需保留严格的直接连接地址校验，在 Desktop profile 的 `cordis.patch.yml` 中设置下列覆盖，或修改现有 `web-fetch-http` 设置命名空间中的同名字段：

   ```yaml
   - id: web-fetch-http
     config:
       requirePublicIp: true
   ```

3. 加载更新后的 profile 后核对有效设置。开启严格模式时，直接请求非公网目标应返回 `WEB_BLOCKED_URL`；关闭时则把该地址交给已配置网络。
