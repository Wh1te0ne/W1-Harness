# W1 品牌资源导航

W1 Harness 固定使用 W1 Brand `2.0.0-preview.14` 的字高对齐 Logo 和折面平面 App 图标。App 图标采用石墨灰明暗两版，整体仍为暂定稿。来源提交和逐文件摘要见 [source.json](brand/source.json)，各平台用法见[品牌规范](../../docs/W1品牌规范.md)。

| 位置 | 用途 | 维护方式 |
|---|---|---|
| [brand/source.json](brand/source.json) | 固定来源快照、版本及 SHA256 | 引入品牌版本时更新 |
| [brand/2.0.0-preview.14/](brand/2.0.0-preview.14/) | 当前品牌资源副本 | 从固定提交复制 |
| [LICENSE](LICENSE) | 品牌资产的独立授权 | 随品牌源同步 |
| mark.svg | 原始 Fold 母标副本 | 导出脚本从正式源复制 |
| exports/ | 平台尺寸、明暗 SVG、PNG 和八帧 ICO | `node scripts/w1/export-brand.mjs` 生成 |
| preview.png | 当前 HARNESS 明暗主题预览 | 从固定提交复制 |
| reference-concepts.png | 原始母标设计选择依据 | 历史参考 |

`app-icon` 与 `app-icon-light` 的 SVG/PNG 是浅色完整方图，`app-icon-dark` 是深色方图；同名前缀的 ICO 单独从透明前景生成，供 Windows 原生入口使用。`interface-logo-light/dark.svg` 是完整横向 Logo；`wordmark-light/dark.svg` 只含 HARNESS 字标；`mark-dark` 表示深色母标，`mark-light` 表示浅色母标。

[旧母标素材包](../../releases/w1-brand/README.md) 和 `E:\ProjectDev\W1-Brand\assets\fold\1.1.0` 保留作历史交付，不是新的 HARNESS 品牌发布。产品内 ICO、PNG、SVG 与生成代码是实际消费副本，不能因名称相似而删除。
