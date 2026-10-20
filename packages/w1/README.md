---
description: "W1 product extensions and their documentation owners."
kind: "package-group"
---

# packages/w1

English | [中文](README.zh.md)

## Summary

W1 packages add product-specific conversation, browser, notification, usage, and workflow behavior to the existing plugin framework.

## Table of Contents

- [Packages](#packages)
- [Dev Note](#dev-note)

## Packages

See [the product guide](../../docs/W1-Harness.md) for each feature's owning README, compatibility and verification status. [Tools](../../docs/subsystems/tools.md), [LLM](../../docs/subsystems/llm-streaming.md), and [sessions](../../docs/subsystems/session.md) retain ownership of the shared runtime APIs these extensions consume.

## Dev Note

The usage and notification packages have standalone JavaScript builds; TypeScript extensions use the ordinary workspace build. Product release packaging includes their private dependency closure without publishing them to npm.
