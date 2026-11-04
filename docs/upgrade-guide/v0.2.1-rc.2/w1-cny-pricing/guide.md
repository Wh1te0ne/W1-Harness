---
kind: upgrade-guide
description: W1 usage ledgers store fixed CNY amounts and versioned exact-route tariffs instead of mutable USD catalog estimates.
---

# W1 CNY pricing and historical records

English | [中文](guide.zh.md)

## Change

W1's local usage ledger changes monetary basis from USD to CNY. Price and exchange-rate changes apply prospectively through dated records in `config.prices.book`. The legacy currency, matching and price-table update controls cannot overwrite that book. OpenRouter prices apply only to exact OpenRouter routes; other channels bind only their actual source, including separate VX Default, High and Enterprise groups, or retain manual locks. Deletion archives a price version without removing prior consumption.

## Migration

1. Complete Test verification and promote the frozen candidate through the normal daily launcher after daily exit. Do not hot-replace the running daily ledger.
2. On first startup, the application backs up `DSH_HOME/storages/cost-meter-custom/ledger.json` into the adjacent `pricing-backups/before-cny-*.json`, converts the old monetary fields, imports manual prices and records `prices.book.version = 1`. The outer ledger version remains 1; the price-book marker identifies the CNY basis.
3. The receipt upgrade makes a separate `pricing-backups/before-billing-receipts-*.json` backup. It retains prior verified corrections and fixes remaining historical amounts to the saved ledger totals. Incomplete detail becomes a labeled historical aggregate. New receipts and aggregate changes commit together; missing usage stays unpriced. Check that session details, provider totals and sidebar costs agree after restart. See the [call identity acknowledgement](../../../persistence-changes/2026-10-21-w1-call-receipts.md).
4. Check each provider group and its source status. Untouched imported VX entries follow their group; edited manual records stay locked. Unknown rules retain the old price with a warning. Cache write/one-hour write fields and actual effort multipliers are used in call statistics. Missing historical duration or effort is not guessed; see the [optional V4 usage acknowledgement](../../../persistence-changes/2026-10-21-w1-billing-usage.md).
5. Set manual or automatic USD/CNY rates in Model prices. Confirm that new USD calls use the saved rate while old CNY amounts remain fixed. Configure different billing modes under separate routes; no batch/Flex discount is inferred.
6. To roll back, stop the application, preserve the current ledger separately, and restore the matching pre-CNY ledger backup together with the prior application artifacts. An old binary must not consume the CNY ledger. Calls recorded after the backup need separate reconciliation; restoring only old artifacts is not a valid rollback.
7. For an explicitly approved one-time historical correction, stop the target app and run `node packages/w1/usage/scripts/reprice-history.mjs --ledger <private-ledger.json> --sessions <sessions-directory> --plan <private-plan.json> --preview`, then apply that exact plan with the same `--ledger` and `--plan` plus `--apply`. Verify `prices.book.audit.status = repriced`, compare the private report and preserve its backup. The plan estimates missing details under the documented rules and changes legacy amounts only; active prices, token counts and existing receipts stay fixed. Roll back this correction by restoring its `*-before.json` while stopped. Model pricing, including peak settings, is maintained only under Usage.
