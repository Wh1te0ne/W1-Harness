---
kind: upgrade-guide
description: "Desktop HTTP text retrieval now uses system routing by default; public-address enforcement remains optional."
---
# Desktop web-fetch address policy

English | [中文](guide.zh.md)

## Change

W1 Desktop now sets the HTTP fetch provider's `requirePublicIp` to `false`. Requests use system DNS/routing and the installed proxy policy, including destinations that resolve to non-public addresses. URL credential/scheme checks, same-origin redirects and response limits remain. Other profiles and direct provider consumers keep the strict default. Explicit proxy routes continue to delegate target DNS to the proxy in either mode.

## Migration

1. No network configuration change is required to accept the Desktop default. Existing saved settings take precedence.
2. To retain strict direct-address validation, set this override in your Desktop profile's `cordis.patch.yml`, or set the same field in the existing `web-fetch-http` settings namespace:

   ```yaml
   - id: web-fetch-http
     config:
       requirePublicIp: true
   ```

3. Confirm the effective setting after loading the updated profile. With strict mode on, a direct request to a non-public target is rejected with `WEB_BLOCKED_URL`; with it off, that address is handed to the configured network.
