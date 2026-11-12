# Web 与 iOS 使用

## 本轮更新边界

`v2.0.0-preview.3` 的 Home / Harness 横排 Logo 已改为字高对齐，文件比例也随之改变；字标矢量未变。四个产品的图标状态均为 `provisional`。Music 在本仓库只有 App 图标，不提供虚构的 InterfaceLogo / Wordmark。Calendar 自 2.0.0-preview.6 起提供 provisional 的横排 Logo 与字标，比例 1512:360。

消费者按用途分别更新：图标复制 `app-icon.*`、需要的图层文件及 `AppIcon.appiconset`；Logo 复制 `interface-logo.*` 或 `InterfaceLogo.imageset`。新 Logo 按高度摆放（不低于 48px），不要沿用写死的宽度或旧的 `1200:360` 比例。品牌仓库发布不会自动替换任何运行中的应用。

## Web

复制某个固定 tag 下需要的文件到产品的本地资源目录，不在页面运行时请求私有 GitHub raw 地址。

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/brand/interface-logo-dark.svg">
  <img src="/brand/interface-logo-light.svg" alt="W1 Home" width="200" height="60">
</picture>
```

页面内 Logo 必须跟随页面实际主题。上面的写法只适用于完全跟随系统的页面；产品有自己的主题选项时，应让它决定使用哪个文件，不能在用户手动选择浅色主题时仍只依赖系统媒体查询。透明版本用于页面表面，`-on-surface` 用于需要品牌固定背景的展示。

`dist/tokens/brand.css` 继续提供母标 / Logo 的主题变量和 `data-w1-brand-theme` 选择器，不覆盖 App 图标的配色。`currentColor` 母标适合内联 SVG；外部 `<img>` 内的 SVG 不会直接继承宿主元素的文字颜色。直接使用 light/dark 文件最清晰。

Logo 字标的切缝使用 mask；App 图标的 W1 镂空同样使用 mask。通过 `<img>` 引用时不共享 ID；如果将同一个 SVG 多次内联到一份 DOM，必须给内部 ID 和 `url(#...)` 引用一起加唯一前缀。

### 网页图标

各场景的背景要求见 `docs/DESIGN-SYSTEM.md` 的“各平台的背景与主题要求”。

```html
<link rel="icon" type="image/svg+xml" media="(prefers-color-scheme: light)" href="/brand/favicon-light.svg">
<link rel="icon" type="image/svg+xml" media="(prefers-color-scheme: dark)" href="/brand/favicon-dark.svg">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
```

- `favicon-*` 分别复制自 `light/` 和 `dark/` 的 `app-icon-foreground.svg`，保持透明。
- `apple-touch-icon` 复制自 `app-icon.png`，保持不透明。只能放一个文件，用哪个主题待确认。
- PWA 的 `any` 图标用透明的 `app-icon-foreground`，`maskable` 图标用 `app-icon-maskable`，两者分开声明，不要写 `"any maskable"`，否则未裁切时图形会偏小。

```json
{ "icons": [
  { "src": "/brand/icon-any.png", "sizes": "1024x1024", "type": "image/png", "purpose": "any" },
  { "src": "/brand/icon-maskable.png", "sizes": "1024x1024", "type": "image/png", "purpose": "maskable" }
] }
```

需要 192px、512px 时从 1024px PNG 等比缩小，不改图形。

以上写法尚未在 Safari 和实际产品中验证，接入时要在浅色、深色标签栏上实际检查。

## Android 自适应图标

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@mipmap/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
```

- 前景复制自 `app-icon-android-foreground.png`，背景复制自 `app-icon-background.png`，都是 1024px，按需要的密度等比缩小。
- 默认资源目录放 `light/`，`-night` 资源目录放 `dark/`。
- 暂未交付 Android 13 主题图标用的 monochrome 层。
- 以上只验证了资源的尺寸、透明度和安全区，尚未在 Android 设备上检查。

## iOS / iPadOS

`dist/ios/W1HomeBrand.xcassets` 包含：

- `AppIcon.appiconset`：浅色 Any 与深色 Dark 两个 1024px PNG。
- `InterfaceLogo.imageset`：透明 PNG 的单行组合，提供浅色 / 深色外观。
- `Wordmark.imageset`：独立 HOME 字标，用于需要单独组合的界面。

`W1HarnessBrand.xcassets` 同样包含上述三类资产，其 Wordmark 与 1.1.0 一致，InterfaceLogo 已按字高对齐重排。`W1CalendarBrand.xcassets` 同样包含这三类资产，其中 InterfaceLogo / Wordmark 为 provisional。`W1MusicBrand.xcassets` 仅有 AppIcon 与目录元数据。

已有 AppIcon 的项目，把对应图片和 `Contents.json` 合入现有资源集；不要在同一 target 同时保留两个同名 AppIcon。也可以导入整个目录并明确选择唯一的 App Icon Source。

使用完整组合时，保持比例：

```swift
Image("InterfaceLogo")
    .resizable()
    .scaledToFit()
    .frame(width: 200, height: 60)
    .accessibilityLabel("W1 Home")
```

资源集已声明原色渲染；不要再把它强制设为 template 后任意染色。iOS 用的完整 App 图标是方形、不透明 RGB PNG，圆角交给系统处理；Windows 不裁圆角，改用透明的 `app-icon-foreground`，并按深浅主题分别取 `dark/`、`light/`（见 `docs/DESIGN-SYSTEM.md`）。界面 Logo 与字标 PNG 则保留透明度。

Apple 的资产目录支持单张 1024px 母版和深色外观资源，参见 [配置 App 图标](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)。本包交付 Any / Dark 传统资源目录；未包含自定义 tinted、clear 外观或 `.icon` 工程。前景的 W1 是透明镂空，前景 / 背景分层文件可用于后续 [Icon Composer](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer) 工作流。

本轮仅完成资源格式和映射检查，没有在 Windows 环境执行 Xcode 编译、iPhone 安装或 App Store 上传。当前图标是平面稿，未验证平台动态玻璃下的效果。

## 更新与回退

在消费仓库记录 `repository`、`tag`、`commit`、实际使用文件及 SHA-256。更新前检查新版本规范与变更记录；更新后检查实际页面、浅深色切换和设备桌面。需要回退时重新复制原 tag 的对应文件，不在导出 PNG 上临时修补。
