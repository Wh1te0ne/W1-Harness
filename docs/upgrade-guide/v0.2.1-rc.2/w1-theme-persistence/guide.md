---
kind: upgrade-guide
description: W1 appearance colors and custom CSS move from browser-only storage to the Host settings document.
---

# Durable W1 appearance

English | [中文](guide.zh.md)

## Change

W1 stores the selected palette, light/dark colors and custom CSS in the live ui-theme configuration field appearance. Browser localStorage is a migration source and last-good cache. Saving waits for Host acceptance; failed reads do not overwrite preferences with defaults. The startup document includes the saved palette and CSS.

## Migration

1. Back up the current local appearance and profile patch before promoting the Test build. Preserve the existing theme and stylesheet.
2. Start the updated app. Once formal settings load, an existing appearance field wins; otherwise a valid local w1.appearance.v1 value migrates with a namespace revision fence. A failed migration retains the local selection and reports the failure.
3. In Test, verify upgrade from legacy storage, normal exit/reopen, and reopen with the local cache absent. Verify both the profile patch and the actual runtime palette. Custom CSS must survive the same Host persistence path.
4. Reset stores an explicit default appearance, so an old local value cannot restore a discarded theme. Do not clear the Host field to reset it.
5. For rollback, stop the app and restore the previous artifacts; the browser cache retains the last accepted selection. Keep the profile backup for recovery; preserve unrelated settings.
