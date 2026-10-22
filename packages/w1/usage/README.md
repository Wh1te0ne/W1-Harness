---
description: "W1 built-in product features and configuration."
kind: "package-reference"
---

# W1 built-in Usage

English | [中文](README.zh.md)

## Summary

Usage is a W1 application feature beside Plugins and Scheduled tasks in the sidebar. Its full-page overview, usage details, model prices and settings reuse the existing token, cost, budget, Session and historical-ledger services. Official DeepSeek wallet queries remain disabled. Model API keys remain in W1's credential store.

The sidebar shows today's estimated API cost and total tokens together. Clicking opens Usage; hovering or focusing shows up to eight provider/model totals. Session cost details have one entry in the conversation header.

## Table of Contents

- [Prices and recorded charges](#prices-and-recorded-charges)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Prices and recorded charges

All recorded amounts and displayed prices use CNY. Manual prices bind an exact provider/model key and take precedence over official synchronization. OpenRouter's official model API supplies prices only for configured OpenRouter routes with exact model IDs; it is not a price directory for other channels. Known DeepSeek, Volcengine and VX routes bind their own price sources; unfamiliar providers require an explicit source choice. VX Default, High (GPT/Claude高档货) and Enterprise use distinct exact groups. Untouched VX records imported by the previous setup switch to their corresponding source; subsequent manual edits remain locked. Sources refresh every six hours, retry failures with bounded backoff, retain the last valid model price and expose status, timestamps, per-model issues and a retry button. Empty or unsupported responses cannot clear prices. Official pages are parsed when no public price API exists; an unsupported model remains manual or unpriced. Unknown prices retain token and call counts and mark the cost incomplete.

Model prices retain unique, dated versions. Editing, deleting or restoring affects subsequent calls only. Deletion requires confirmation and moves a version into the separate archive view; browsing that view never restores records. Restoring creates a new effective version and refuses to overwrite an existing active price. Recreating the same model, even with the same amount, creates a distinct version. Manual tariffs use CNY per million input, cache-hit input and output tokens. Optional peak/off-peak prices use request completion time in Beijing, with per-model weekday, time-window and holiday rules. Input, output, cache reads, cache writes and one-hour writes have separate visible fields. One-hour writes are a subset of total writes. Long-context thresholds and the actual outgoing effort parameter affect per-call fees and statistics. Missing duration splits mark estimates; missing parameters required for a multiplier leave the call unpriced. OpenAI twelve-hour writes are kept distinct and flagged when duration usage is unavailable.

The collapsed exchange-rate section offers manual USD/CNY entry or Frankfurter's daily ECB reference. Selecting automatic mode saves and fetches immediately, then checks daily while the app runs. Failures retain the last valid dated rate, retry with backoff and display a warning. Price saves return fresh state without restart; revision checks reject late stale snapshots. USD tariffs are converted using the saved rate effective at call completion. Changing the exchange rate never revalues prior CNY consumption. Existing evidence-backed corrections remain. The receipt migration backs up the ledger, keeps all remaining historical CNY amounts and represents incomplete old detail as provider/model/day aggregates. Those rows no longer remain blocked by the earlier strict audit. New calls receive unique IDs and save usage, actual request parameters, CNY rates, FX and final amounts in the same atomic ledger replacement as their totals. Main calls, suggestion selection/generation, side chats, compaction and native search share accounting; equal independent calls stay separate. Reported partial usage is retained on interruption; missing usage is explicitly unpriced. Final usage is flushed before the finish event; failed writes keep pending receipts for retry and expose a warning. Detailed receipts follow the configured history retention, while archived daily totals remain. See the [migration and rollback guide](../../../docs/upgrade-guide/v0.2.1-rc.2/w1-cny-pricing/guide.md).

An explicitly authorized one-time history correction is available through `scripts/reprice-history.mjs`. Preview and apply a frozen plan while the target app is stopped. It uses exact provider/model quotes, retains existing receipts and usage totals, and replaces legacy amounts in session, day and provider totals together. Logs supply per-call timing and context; mismatched logs weight each recorded token category by its observed tariff distribution. Missing logs use average context and time-weighted daily peak prices; missing write duration uses ordinary writes, missing effort uses 1x, and wholly missing usage uses the same route/model average for money only. These assumptions are recorded as estimates in a private before/after report and backup. Reapplying the same correction is harmless; a changed ledger requires a new preview. Model prices and per-model peak settings have one entry under Usage; the duplicate DeepSeek peak settings section is removed.

Recorded estimates are retained as settled historical amounts without recurring review prompts in the sidebar or usage details. Archiving a model price removes its current synchronization issue immediately, preserves dated tariffs and all consumption, and prevents late synchronization results from restoring either the price or its warning. Actual unavailable prices and current source failures retain their explicit status.

## Model Experience

None, as this feature displays local notifications or recorded usage without initiating model requests.

#### KV Cache effect

This feature adds no model prompt or tool declaration and does not alter the model request prefix.

## Known Limitations and Deferred Work

- Estimates are not provider invoices. Cache storage by duration, batch/Flex discounts and non-token surcharges are not inferred; configure a separate route with its actual tariff for a different billing mode. Incomplete old detail is retained as a labeled aggregate, not fabricated per-call prices.
### Dev Note

The web-app composition loads this module by default. It does not declare dsh.bundle and is not installed as an optional profile plugin. The dsh-usage-manager package name, usageManager service, usageManagerUsage projection and DSH_HOME/storages/cost-meter-custom ledger location remain unchanged. There is one billing listener and one observable ledger source. UI registrations dispose with the module.

scripts/w1/migrate-usage.mjs backs up the stopped W1 profile and ledger, removes external usage-manager and legacy cost-meter entries, and keeps their private files for rollback. Original DSH is untouched. The migration does not modify the ledger or model credentials.

Run node scripts/build.mjs in this directory to rebuild only the browser modules; run node --test test/w1-policy.test.mjs test/w1-navigation.test.mjs for focused checks. Host JavaScript and lib/vendor are retained source artifacts; tsdown.config.ts prevents the generic workspace bundler from overwriting them. Refresh development links once with scripts/w1/Start-W1.ps1 -RefreshProject. No installer is needed.

Cost Meter's MIT license and attribution remain in LICENSE, UPSTREAM.md and THIRD_PARTY.md. Preserve W1's wallet-removal policy, independent page and default composition when following upstream changes. Keep real runtime data outside this source directory.

Verification evidence and remaining native acceptance items are maintained in [the W1 work log](../../../docs/工作记录.md).
