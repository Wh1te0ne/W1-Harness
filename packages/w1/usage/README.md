---
description: "W1 built-in product features and configuration."
kind: "package-reference"
---

# W1 built-in Usage

English | [中文](README.zh.md)

## Summary

Usage is a W1 application feature beside Plugins and Scheduled tasks in the sidebar. Its full-page overview, usage details, model prices and settings reuse the existing token, cost, budget, Session and historical-ledger services. Official DeepSeek wallet queries remain disabled. Model API keys remain in W1's credential store.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as this feature displays local notifications or recorded usage without initiating model requests.

#### KV Cache effect

This feature adds no model prompt or tool declaration and does not alter the model request prefix.

## Known Limitations and Deferred Work

- Notification delivery and recorded usage do not establish that a user saw a banner or that an estimate equals provider billing.
### Dev Note

The web-app composition loads this module by default. It does not declare dsh.bundle and is not installed as an optional profile plugin. The dsh-usage-manager package name, usageManager service, usageManagerUsage projection and DSH_HOME/storages/cost-meter-custom ledger location remain unchanged. There is one billing listener and one observable ledger source. UI registrations dispose with the module.

scripts/w1/migrate-usage.mjs backs up the stopped W1 profile and ledger, removes external usage-manager and legacy cost-meter entries, and keeps their private files for rollback. Original DSH is untouched. The migration does not modify the ledger or model credentials.

Run node scripts/build.mjs in this directory to rebuild only the browser modules; run node --test test/w1-policy.test.mjs test/w1-navigation.test.mjs for focused checks. Host JavaScript and lib/vendor are retained source artifacts; tsdown.config.ts prevents the generic workspace bundler from overwriting them. Refresh development links once with scripts/w1/Start-W1.ps1 -RefreshProject. No installer is needed.

Cost Meter's MIT license and attribution remain in LICENSE, UPSTREAM.md and THIRD_PARTY.md. Preserve W1's wallet-removal policy, independent page and default composition when following upstream changes. Keep real runtime data outside this source directory.

Verification evidence and remaining native acceptance items are maintained in [the W1 work log](../../../docs/工作记录.md).
