# W1 品牌资源导航

W1 Harness 当前使用 [W1 Brand v1.1.0](https://github.com/Wh1te0ne/W1-Brand/releases/tag/v1.1.0) 的 HARNESS 产品资产。W1 Fold 母标属于系列公共品牌；本产品使用已批准的专属字标与组合图标。来源、用法和更新步骤见[品牌规范](../../docs/W1品牌规范.md)。

| 位置 | 用途 | 维护方式 |
|---|---|---|
| [brand/source.json](brand/source.json) | 固定上游提交、版本及 SHA256 | 引入品牌版本时更新 |
| brand/1.1.0/ | 正式品牌文件的消费副本 | 从固定提交复制，不直接编辑 |
| [LICENSE](LICENSE) | 品牌资产的独立授权 | 随品牌源同步 |
| mark.svg | 原始 Fold 母标副本 | 导出脚本从正式源复制 |
| exports/ | 平台尺寸、明暗 SVG、PNG 和八帧 ICO | `node scripts/w1/export-brand.mjs` 生成 |
| preview.png | 正式 HARNESS 明暗主题预览 | 从品牌发布文件复制 |
| reference-concepts.png | 原始母标设计选择依据 | 历史参考 |

`app-icon` 与 `app-icon-light` 均为 Windows 使用的浅色产品图标；`app-icon-dark` 为深色版本。`interface-logo-light/dark.svg` 是完整横向 Logo；`wordmark-light/dark.svg` 只含 HARNESS 字标；`mark-dark` 表示深色母标，`mark-light` 表示浅色母标。

[旧母标素材包](../../releases/w1-brand/README.md) 和 `E:\ProjectDev\W1-Brand\assets\fold\1.1.0` 保留作历史交付，不是新的 HARNESS 品牌发布。产品内 ICO、PNG、SVG 与生成代码是实际消费副本，不能因名称相似而删除。
