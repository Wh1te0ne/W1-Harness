# Security reporting / 安全报告

W1H is an early preview with tools that can operate files, run commands, and control authorized browser pages. Review [SAFETY.md](SAFETY.md) and the component's permission documentation before use.

For a suspected vulnerability, use [GitHub private vulnerability reporting](https://github.com/Wh1te0ne/W1-Harness/security/advisories/new). Include affected W1H version, DSH baseline, component, impact, and a minimal reproduction with synthetic data. Do not post API keys, pairing payloads, user sessions, or browser login state in public Issues.

如发现漏洞，请通过上面的 GitHub 私密安全报告入口提交版本、基线、组件、影响及使用模拟数据的最小复现，不要在公开 Issue 中提供 Key、配对信息、聊天或登录态。维护者按可用时间处理，当前未提供响应时限或漏洞奖励承诺。

The relay is intended for self-hosted personal use. Its encrypted transport does not constitute a multi-tenant security audit. Preview Windows builds are unsigned; their updater verifies download hashes from the configured W1 release source.
