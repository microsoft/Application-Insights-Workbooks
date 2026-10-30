---
name: validate-workbook-browser
description: 'Validate Azure Workbooks with Playwright or MCP. Use for workbook browser testing, Azure sign-in or tenant selection, screenshots, and manual/AI-assisted redaction. Requires a user-selected tenant and pauses live execution even in autopilot until confirmed.'
---

# Validate a workbook in the browser

Follow the [testing guide](../../../Documentation/Testing.md) and use the shared [validator](../../../test/browser/workbookBrowserValidator.js).

## Confirm the tenant before live work

1. Ask the user **which Azure tenant to sign in to**, and which non-production subscription scopes to use. Use the host's structured question tool when available. Do not ask for passwords, tokens, or other credentials.
2. **Pause the live workflow and wait for the user to select and confirm the tenant.** This applies in autopilot too. A missing, declined, cancelled, or unavailable response is not permission to pick the current, default, previously used, or first available tenant. Do not navigate to sign-in, switch accounts, import a workbook, query Azure, or capture portal screenshots while waiting. Offline code and synthetic tests can continue.
3. Have the user sign in or switch directories themselves. Set the selected tenant GUID and confirmation only after their response, using private per-run arguments or environment variables. Do not commit tenant information, reuse an old confirmation for a new run, or echo account details.
4. The runner must match the portal account-menu tenant to that selection before import, navigation, parameter actions, and screenshots. If the check pauses or cannot verify the tenant, stop and ask the user; never bypass it or select another tenant automatically.

## Offer screenshot and redaction choices

Ask whether screenshots would help. Screenshots remain disabled unless requested; when enabled, **auto redaction is the default**.

If auto redaction hides too much, offer:

- **Auto:** conservative automatic masks plus any extra selected masks.
- **Manual masks:** the user selects CSS regions to hide before capture; other content may remain visible.
- **AI-assisted mask selection:** use authorized/local inspection to propose CSS masks, then obtain the user's approval. The validator applies those selectors; it does not call an AI service or send images anywhere.
- **Unredacted local capture:** explicitly disable masks only after warning about sensitive content and receiving specific approval. The user can edit/redact the local image manually afterward.

Manual, AI-assisted, and unredacted modes require explicit approval for potentially sensitive capture. Never turn masking off automatically after an error or because the result is too dark. Do not upload unredacted content to third-party AI services. Keep all captures local and private, and review the final edited/redacted image with the user before any sharing.

## Run and report

1. Use a new empty unsaved workbook's Advanced Editor. Do not replace an existing draft or save/provision an Azure workbook.
2. Use `npm run test:browser` for a dedicated local CDP browser or generate the portable MCP runner with `npm run test:browser:script`.
3. Run only the agreed checks and scopes. Observe all approval, no-data, and redaction failures; do not convert them into passes.
4. Report the source hash, requested contract results, aggregate counts, selected redaction mode, and coverage limits. Do not include tenant IDs, account identities, record values, or raw screenshots in PR comments.
5. Images remain `reviewRequired` and not approved for publication, even in auto mode. No automatic upload is permitted. Remove task-owned intermediate images and private per-run configuration when finished.
