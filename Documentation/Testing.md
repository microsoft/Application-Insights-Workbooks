# How to test your changes

Testing changes to a template can be done in three ways:

1. [**Using Advanced Mode**](#using-advanced-mode): Works locally in your browser, exclusively for you.
2. [**Automated browser validation**](#automated-browser-validation-opt-in): Opt-in Playwright smoke tests and explicit UI contracts.
3. [**Redirecting to a GitHub Branch**](#redirecting-the-gallery-to-a-github-branch): Allows anyone with the URL to test changes temporarily; slightly more complicated but widely accessible.

## Using Advanced Mode

If you're only modifying a workbook, you can test your changes locally without any usage of Git. Follow these steps:

1. **Create an empty workbook.**
2. **Access Advanced Mode.**
3. **Paste the contents of the `.workbook` template file into Advanced Mode.**
4. **Click on the `Apply` button.**

> [!TIP]
> If your template content is valid, it will appear in the view. If not, you'll receive an error notification explaining why your content is invalid.

## Automated browser validation (opt-in)

The browser validator complements the existing JSON/gallery validators and the [static analyzer](../scripts). It follows the repository's Mocha conventions, but authenticated tests live under `test/browser/` and are **not included in normal `npm test` discovery or CI**. Fast regression tests for the validator itself run in normal CI. `playwright-core` does not download a browser.

The shared runner:

- Refuses to replace a saved workbook or a non-empty Advanced Editor, and targets only the model bound to the visible editor rather than cached background models.
- Applies the exact requested source and reports its normalized-source SHA-256, not its contents.
- Checks the primary parameter-driven tabset's labels and selected states using native Enter-key activation, which remains usable during query-driven layout reflow.
- Optionally checks that deferred content is not mounted before a parameter action, appears after it, and hides its producer when requested. A self-hiding producer must have its visibility parameter declared as global before it.
- Optionally verifies exact grid column labels and row bounds using `aria-rowcount`, not the number of virtualized rows currently rendered.
- Offers optional local screenshots, disabled by default, with conservative masking applied before capture and a mandatory manual-review reminder.

Commands and parameter actions use native Enter-key activation after visibility and enabled-state checks. This validates the accessible interaction path without depending on pointer coordinates during query-driven reflow; it does not certify mouse hit testing.

**This is smoke and contract validation, not automatic validation of every query or workflow.** Nested tabsets, filters, graphs, row selections, query correctness, and effective resource coverage still need scenario-specific tests. A requested grid contract fails when no result grid is available; no-data is not reported as healthy or as a passing data check.

### Prepare a browser

Use Node 24, as in CI, and run `npm install`. Use only trusted templates and a non-production account with Reader permissions at the intended scopes. Rendering a real template can execute its queries and incur query costs. The runner does not click Save or ARM action links, capture authentication state, or collect traces. Screenshots require a separate explicit opt-in.

Sign into Azure yourself in the **current English-language React workbook view**. In the browser that will run the test, create a **new empty unsaved workbook**, open **Advanced Editor**, and leave its default empty JSON in place. The validator supplies the template; do not paste it first. It deliberately does not automate sign-in or discard an existing draft.

### Run the Mocha validator against a local browser

Start a dedicated Chromium-based browser with a loopback debugging port and a separate profile **outside the repository**. Do not expose the port publicly or use your normal profile. For example, on Windows:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\WorkbookBrowserValidation"
```

After preparing Azure and Advanced Editor in that browser:

```powershell
$env:WORKBOOK_BROWSER_TEMPLATE = "test\browser\fixtures\Smoke.workbook"
$env:WORKBOOK_BROWSER_CHECKS = "test\browser\fixtures\smoke-checks.json"
$env:WORKBOOK_BROWSER_CDP_ENDPOINT = "http://127.0.0.1:9222"
npm run test:browser
```

The checks file is optional. The runner requires exactly one eligible portal page, reports configuration/authentication failures as failures, and disconnects its client afterward without creating or closing browser contexts. Close the dedicated browser yourself when finished. Only credential-free loopback HTTP CDP endpoints are accepted.

### Run with an existing Playwright or MCP browser

If a browser tool already supplies an authenticated Playwright `page`, generate a self-contained function for that tool instead of opening a debugging port:

```powershell
New-Item -ItemType Directory -Force .playwright-mcp | Out-Null
npm run test:browser:script -- --workbook "test\browser\fixtures\Smoke.workbook" --checks "test\browser\fixtures\smoke-checks.json" --output ".playwright-mcp\workbook-check.js"
```

Prepare a new empty unsaved workbook's Advanced Editor in the tool's selected tab, then run the generated `async (page) => { ... }` function. Use the tool's `filename` input where available, pointing to the generated file's absolute path. The function uses no Node imports inside the browser tool. Hosts can impose shorter call timeouts; use the local Mocha runner for longer validations.

Generate into a directory your browser tool permits. Existing output files are never overwritten: choose a fresh name or remove only your previous generated file before regenerating. Generated scripts contain the template and its checks, **not authentication state**; keep them private and remove them after use. `.playwright-mcp/` is ignored by Git.

### Define reusable checks

[Smoke.workbook](../test/browser/fixtures/Smoke.workbook) uses only static text and inline JSON, so the example does not need tenant telemetry or query Azure resources. Its [checks file](../test/browser/fixtures/smoke-checks.json) exercises two tabs, one action revealing both a table and text, producer visibility, a two-row result, and exact column labels.

Use the same validator for another workbook by changing the template path and, optionally, supplying a JSON checks file:

- `tabs`: exact primary tab labels, in order. Static labels are inferred if omitted; parameterized labels require explicit expectations. All declared tab links must be parameter links; otherwise automatic navigation is refused.
- `timeout`: per-operation timeout in milliseconds, from 1 to 120000; default 30000.
- `deferred`: checks with `trigger` (a unique parameter-link label), `heading` (the content's unique heading), and optional `tab` (defaults to the first primary tab).
- `hideTriggerAfterLoad`: require the trigger to become hidden; default false.
- `minRows`, `maxRows`, `columns`: optional data contracts for a query panel. Row bounds exclude the header. Columns are exact, ordered, non-empty display labels with normalized whitespace; selection icons are excluded.

Checks sharing the same tab and trigger are grouped: all associated headings must be absent before the action is clicked once, then every panel's requested contracts are validated. The trigger must be ready and scrolled into view before initial absence is checked.

The JSON report contains the source hash, visited tab labels, requested contract results, and aggregate row counts, not record values. Only requested contracts are covered; review even these summaries before publishing because labels can contain context. Do not publish generated scripts, browser profiles, or unreviewed tenant screenshots as test evidence.

### Optional masked screenshots

The script generator and validation report offer screenshot guidance when capture is disabled; they never prompt or capture implicitly. To opt in for a generated MCP/Playwright runner:

```powershell
npm run test:browser:script -- --workbook "test\browser\fixtures\Smoke.workbook" --checks "test\browser\fixtures\smoke-checks.json" --screenshots "C:\local-evidence\workbook-check" --output ".playwright-mcp\workbook-check-with-images.js"
```

For the Mocha runner set `WORKBOOK_BROWSER_SCREENSHOTS` to a local directory. These explicit overrides preserve any additional masks in the checks file. Alternatively, add a `screenshots` object to the checks file:

```json
{
  "screenshots": {
    "directory": ".playwright-mcp/screenshots",
    "maskSelectors": ["[data-sensitive-context]"]
  }
}
```

`maskSelectors` is optional and **adds** masks; it cannot disable the defaults. Each selector must match in every captured stage. An invalid selector or one matching nothing fails capture rather than silently omitting a requested mask. URLs, network paths, and parent-directory traversal are refused for the output directory.

The runner captures each visited primary tab and brings each successfully checked deferred panel into view for another capture. Images are of the workbook iframe viewport, not the surrounding portal/account chrome; this avoids unreliable element clipping across scrolled frames. Before capture it masks grid data cells, inputs, non-contract text, charts, images, and embedded content. Only exact contract tab, heading, and column labels are retained. Redaction CSS is installed in the workbook DOM and checked with a computed-style probe **before** calling screenshot APIs, so it does not depend solely on a browser adapter honoring Playwright's mask/style options. The CSS also hides newly mounted text and media, including virtualized rows. Temporary styles and markers are removed afterward, even if capture fails; blocked redaction fails capture and there is no unmasked fallback.

Images have generated names rather than tenant-derived filenames. The report lists filenames and mask counts, not absolute output paths. Nothing is uploaded or committed automatically. Use a private local directory within your browser tool's permitted output roots, and review **every image** before sharing. Conservative masking is **not guaranteed anonymization**: contract labels themselves can be sensitive, and masking intentionally obscures data needed for some visual checks. Use synthetic fixtures to verify raw data formatting and inspect real data only in the authorized portal. Remove only your own evidence files when finished.

## Redirecting the Gallery to a GitHub Branch
  
> [!IMPORTANT]
> This feature flag is intended for short-term testing and not as a permanent solution.

To test changes in an existing template without merging to master or altering galleries, you can use the `feature.workbookGalleryBranch` setting. This setting instructs the Workbooks view to fetch content from a specific GitHub branch for testing purposes. Other users can also view these changes.

### Steps

1. **Make Changes to Your Branch**: Implement the desired modifications on your branch.
2. **Push to GitHub**: Once changes are made, push the branch to our GitHub repository.
3. **Update Portal URL**: Append `?feature.workbookGalleryBranch=[name of branch]` to the portal URL. For example: `https://portal.azure.com/?feature.workbookGalleryBranch=master`.

   If this worked, a banner will display in the gallery indicating the redirection:

   ![Workbook gallery branch message](./Images/GalleryRedirectWarning.png)

   If it did not work, you will see an error banner indicating why it did not work. Most commonly this is a typo in the branch name, or invalid JSON content in your gallery or template files.

### Limitations

- **Performance**: Loading workbooks from GitHub may slow down loading times and lead to throttling errors if too many items are loaded in a short succession of time.

### Troubleshooting

1. How do I know if content is being served from my GitHub branch?
    - Press on `F12` or `Ctrl+Shift+I` to bring up the developer console.
    - Switch to the network tab, and filter by the "GitHub" keyword.
    - Navigate to a workbook gallery (For example: Azure Monitor -> Workbooks)
    - Inspect that the gallery file loaded is from your own gallery:
    ![Troubleshooting image](./Images/TestDeployTroubleshooting.png)
    - Visit your modified workbooks and galleries. Ensure your changes are being reflected.

2. For other general template troubleshooting, see [Template troubleshooting](./Contributing.md#troubleshooting) in the contributing guide.

If after trying these steps you can't deploy your gallery or templates, [file an issue](https://github.com/microsoft/Application-Insights-Workbooks/issues) and we'll help debug the problem.

## "feature.workbookGalleryRedirect" No longer available

> [!WARNING]
> As of June 2024, a previous third testing option, for uploading an entire template gallery package to an external site or storage account for testing, is no longer available. 
>
> Passing the `feature.workbookGalleryRedirect` feature flag will be ignored. Use the [Redirecting to a GitHub branch](#redirecting-the-gallery-to-a-github-branch) instructions above instead.
