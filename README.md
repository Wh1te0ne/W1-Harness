# W1 Harness

English | [中文](README.zh.md)

<img src="assets/w1/exports/app-icon-light-128.png" alt="W1 Fold mark" width="80">

**A personal AI workspace for coding, research, and everyday tasks, built on DeepSeek Harness.**

[Releases](https://github.com/Wh1te0ne/W1-Harness/releases) · [Product guide](docs/W1-Harness.md) · [Remote deployment](apps/w1-remote/README.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

W1 Harness (W1H) is an independent downstream product, retaining the Cordis plugin architecture of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), with its own desktop identity, releases, and user data. It is not an official DeepSeek application.

## Status

W1H is an early developer preview. Windows x64 is the maintained desktop target. Some features have isolated runtime evidence but still need broader real-device validation; see [release notes](CHANGELOG.md). macOS and Linux retain upstream source without a W1 binary support commitment.

## Features

| Area | What you can do |
| --- | --- |
| Workspace | Organize projects with multiple folders and a primary directory; keep conversations and artifacts locally. |
| Models | Use your own provider credentials; enter the workspace without a DeepSeek account. |
| Workflows | Use goals, plans, approvals, tools, and delegated agents through the plugin framework. |
| Conversation | Get editable reply suggestions, open a side chat, inspect usage, and customize appearance. |
| Browser | Operate the embedded browser or connect the W1 Chrome extension to existing tabs. |
| Notifications | Receive Windows notifications, unread indicators, and taskbar attention. |
| Remote | Pair an Android companion through a self-hosted encrypted WebSocket relay. |

Browser control follows current permissions and conversation ownership. Phone access requires the desktop to remain running. The relay forwards messages; models, credentials, files, and task execution remain on the desktop.

<a id="run"></a>

## Install and update

Download the Windows x64 installer from [W1H Releases](https://github.com/Wh1te0ne/W1-Harness/releases). Preview installers are currently unsigned. Configure your own model API key; downloads contain no credentials.

W1H and DSH have independent versions and update actions:

| Entry | Purpose |
| --- | --- |
| Check W1H Updates | Read W1H release notes, download a verified package, then confirm installation and restart. |
| DSH Upstream Releases | Review source releases and copy a development handoff; integration requires development and validation. |

Both entries are in the Windows tray menu. About shows the W1H version, integrated DSH baseline, and build identity. Source builds discover releases without overwriting their checkout. Read [versions and environments](docs/版本与发布.md) before switching between source, test, and installed builds.

## Components and deployment

| Component | Instructions |
| --- | --- |
| Desktop and Host | [Development workflow](docs/开发与上游维护.md) |
| Android companion and Docker relay | [Build, deployment, pairing, and limitations](apps/w1-remote/README.md) |
| Chrome MV3 extension | [Installation and permissions](packages/w1/chrome-use/README.md) |
| W1 plugins | [Product documentation](docs/W1-Harness.md) |

Deploy the relay with Docker Compose from `apps/w1-remote/`, using your own HTTPS domain and WebSocket forwarding. [Remote operations](docs/远程访问与NAS中继.md) covers checks and recovery. Chrome extensions are distributed as unpacked-extension ZIPs; there is no Chrome Web Store listing.

<a id="run-from-source"></a>

## Develop

Use Node.js `^22.19.0 || >=24.0.0`, the pnpm version pinned in `package.json`, and PowerShell 7 on Windows.

```powershell
git clone https://github.com/Wh1te0ne/W1-Harness.git
cd W1-Harness
corepack pnpm install --frozen-lockfile
corepack pnpm run build
```

Follow [local development](docs/开发与上游维护.md) for desktop preparation and source launch. After the initial build, build only changed modules. Release packaging is separate from daily development.

Keep the W1 instance doing development separate from the candidate it builds. Test profiles have their own data and identity; real API keys stay outside Git. See [self-development and testing](docs/版本与发布.md).

## Roadmap

See [the project plan](docs/项目规划.md) for upcoming work and acceptance status. Priorities are reproducible releases, broader desktop and Android validation, and browser reliability. A listed component or passing test does not imply every native workflow has been accepted.

## Feedback and security

Report W1H problems and proposals in this repository's [Issues](https://github.com/Wh1te0ne/W1-Harness/issues), including W1H version, DSH baseline, environment, and reproduction steps. Read [contribution guidance](CONTRIBUTING.md) and [security reporting](SECURITY.md); remove keys, pairing codes, personal sessions, and private file content.

## License and upstream

W1H uses the [MIT License](LICENSE), retaining DeepSeek's copyright notice. Cordis, runtimes, fonts, and other dependencies retain their own licenses. See [upstream architecture](docs/architecture.md) and [vendor notices](vendor/README.md) for technical references and ownership.
