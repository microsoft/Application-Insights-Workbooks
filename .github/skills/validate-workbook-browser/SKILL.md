---
name: validate-workbook-browser
description: 'Validate Azure Workbooks with Playwright or MCP in an external browser. Use for workbook testing, validation reports/findings, reviewer sign-in blockers, virtualized grid audits, render readiness, Azure sign-in, typed readiness handoffs, screenshots, and manual/AI-assisted redaction. Supports in-browser tenant choice, pauses at sign-in/selection screens even in autopilot, and never selects an account automatically.'
---

# Validate a workbook in the browser

Follow the [testing guide](../../../Documentation/Testing.md) and use the shared [validator](../../../test/browser/workbookBrowserValidator.js).

## Open the external browser and handle tenant selection

1. Use an **external Playwright/CDP browser**, not the integrated VS Code browser. If the user asks to select the tenant there, open `https://portal.azure.com/` using the `--open-portal` generated helper on a blank external page. Do not require a separate tenant form before opening that sign-in page.
2. **Pause at any sign-in screen, account list, or tenant/directory chooser and let the user act in that browser.** This applies in autopilot too. Do not click an account, tenant, first/default option, sign-in submission, or confirmation for them. A paused sign-in result is not successful workbook validation. Wait for the user to finish, then rerun the portal check.
   If a readiness handoff is requested, do not depend on the host rendering a Continue button or form. Tell the user: **"Finish account selection/sign-in in the external browser, then type 'I am ready to continue' in chat."** Wait for an actual user reply. An unavailable/declined/cancelled form response, an automatic keep-working reminder, or a request to update these instructions is not readiness confirmation. The phrase confirms readiness only; it does not select a tenant, approve subscription scopes, or authorize screenshot publication.
3. If the user authorized browser-session continuation and the portal is **already signed in with no pending chooser**, continue without another tenant question. Use `--use-browser-tenant` or `WORKBOOK_BROWSER_USE_BROWSER_TENANT=true`; this is an explicit opt-in, not the default for an unspecified tenant. The runner reads the signed-in directory once, privately pins it, and refuses subsequent directory changes instead of following them.
4. If the user instead specifies a particular tenant, use its GUID and explicit confirmation. That strict constraint is preserved; browser-session mode must not replace it silently. Without either authorized workflow, ask the tenant question and pause on a missing/declined/unavailable answer.
5. In both workflows, verify the portal directory before import, navigation, parameter actions, and screenshots; stop at later account/tenant prompts or ambiguous identity. Never switch accounts automatically or echo account metadata. Do not request credentials, commit tenant information, or reuse a pin from an earlier run.
6. Confirm the intended non-production subscription scopes before data queries, and retain the screenshot-consent rules below. Permission to open Portal or reuse its signed-in tenant does not itself approve every subscription or unredacted capture. Offline code and synthetic tests can continue while a live choice is pending.

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
2. Use `npm run test:browser` for a dedicated local CDP browser or generate the portable MCP runner with `npm run test:browser:script`. For PR evidence, set a private `WORKBOOK_BROWSER_REPORT` filename prefix for Mocha or add `--report` to the portable generator. Follow the [report and reviewer-handoff guide](../../../Documentation/Testing.md#validation-reports-findings-and-reviewer-handoff).
3. Run only the agreed checks and scopes. Observe all approval, no-data, and redaction failures; do not convert them into passes.
   For full table checks, opt in to bounded `auditRows`/`nonEmptyColumns` contracts. Count returned ARIA rows, not just mounted DOM rows, and wait for actual range/render changes rather than fixed sleeps. A UI row audit is not a complete backend export or a point-in-time data snapshot.
   JSON cells/tooltips may clip or reformat content. Validate complete values at an approved response/export boundary; never repair or infer missing source data from formatted display text.
4. Report the source hash, requested contract results, aggregate counts, selected redaction mode, and coverage limits. Do not include tenant IDs, account identities, record values, or raw screenshots in PR comments.
   If a PR revision changes during validation, retain the executed revision in the report. Offline compatibility checks are not a new authenticated run.
   Inspect `automationStatus` and each `passed`/`blocked`/`failed`/`not-run` check; successful tool execution is not a validation pass. Persist/format only the report JSON, not surrounding tool metadata or private diagnostics. Keep blocked and historical runs separate.
   Do not infer rendering, findings controls, row selection, or graph/drill-down success from tab navigation. Execute scenario assertions first, then record individual supplementary checks in the same source-verified, tenant-pinned run. Missing records mean `not-run` with `no-data`, not healthy or passed. Never prepopulate passed evidence.
   For repeated reviewer sign-in warnings, compare the warning's date/revision to current evidence, link the exact-revision report, and list remaining work. Do not bypass authentication, claim to sign in the reviewer, manufacture human approval, or automatically resolve/dismiss a review-summary warning. The report's authorized-reviewer requirement remains even after automated checks pass.
5. Images remain `reviewRequired` and not approved for publication, even in auto mode. No automatic upload is permitted. Remove task-owned intermediate images and private per-run configuration when finished.
   Wait for capture completion and review the actual file. A frame/document refresh, lost masks, viewport/scroll drift, or mismatched host output invalidates the image. Discard any rejected local file, report the limitation, and never reduce redaction automatically. Use offline synthetic fixtures to reproduce host/rendering races instead of repeatedly capturing tenant data.
