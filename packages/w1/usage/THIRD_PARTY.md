# 随包运行依赖

用量管家 0.1.2 的 lib/vendor 由 esbuild 从锁定的公开 npm 包构建。只打包 Host 使用的导出，不包含账号、凭据或任何用户运行数据。

| 包 | 版本 | 使用内容 | 许可证副本 |
|---|---|---|---|
| zod | 4.6.5 | z 校验 API | lib/vendor/zod.LICENSE |
| @deepseek-ai/dsh-credentials | 0.1.0-rc.8 | credentialRef 引用名称校验函数 | lib/vendor/credentials.LICENSE |
| @deepseek-ai/dsh-home-paths | 0.1.0-rc.8 | resolveDshHome 路径解析函数 | lib/vendor/home-paths.LICENSE |

均为 MIT 许可，版权及完整条款保留在上述文件。官方 Service / Context 实例由宿主提供；本插件没有打包或创建另一套 Cordis 服务。
