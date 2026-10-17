---
kind: upgrade-guide
description: W1 Usage moves from an optional plugin and settings section into the application's default composition and main navigation.
---
# W1 built-in Usage

English | [中文](guide.zh.md)

## Change

Usage is a main page beside Plugins. The web application loads it by default; the old external usage bundles and settings entry are no longer used. The package/service identities and ledger format remain unchanged.

## Migration

1. Exit W1 and start through [Start-W1.ps1](../../../../scripts/w1/Start-W1.ps1), using -RefreshProject once when updating this development checkout.
2. migrate-usage.mjs backs up the W1 profile and ledger under %USERPROFILE%/.w1-harness-backups/usage-builtin-<timestamp>, removes the external dsh-usage-manager and legacy dsh-cost-meter profile entries, and retains their private files for rollback. Original DSH is untouched.
3. Select Usage in the sidebar. Confirm that history and manual model prices remain available; do not import history again.
4. To return to the previous W1 build, exit W1, restore that build's application composition and the backed-up profile manifests, and recreate its usage-module link to the retained private copy. Keep the current ledger so later usage is not lost.
