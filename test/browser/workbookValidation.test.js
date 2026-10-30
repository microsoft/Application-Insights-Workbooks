const {
    isAzurePortalUrl,
    isAzureSignInUrl,
    loadValidationInput,
    validateCdpEndpoint,
    requireConfirmedTenant,
    openAzurePortal,
    validateWorkbookInBrowser
} = require('./workbookBrowserValidator');

describe('Validating workbook browser behavior (opt-in)...', function () {
    let browser;
    let page;
    let input;

    before(async function () {
        const flag = name => {
            const value = process.env[name];
            if (value === undefined) return undefined;
            if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false.`);
            return value === 'true';
        };
        input = loadValidationInput(process.env.WORKBOOK_BROWSER_TEMPLATE, process.env.WORKBOOK_BROWSER_CHECKS,
            process.env.WORKBOOK_BROWSER_SCREENSHOTS, {
                tenantId: process.env.WORKBOOK_BROWSER_TENANT_ID,
                confirmTenant: flag('WORKBOOK_BROWSER_TENANT_CONFIRMED'),
                useBrowserTenant: flag('WORKBOOK_BROWSER_USE_BROWSER_TENANT'),
                redaction: process.env.WORKBOOK_BROWSER_REDACTION,
                allowSensitiveCapture: flag('WORKBOOK_BROWSER_ALLOW_SENSITIVE_CAPTURE')
            });
        requireConfirmedTenant(input.options.tenant);
        const endpoint = validateCdpEndpoint(process.env.WORKBOOK_BROWSER_CDP_ENDPOINT);
        const { chromium } = require('playwright-core');
        browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
        const candidates = [];
        const signInPages = [];
        for (const context of browser.contexts()) {
            for (const candidate of context.pages()) {
                if (candidate.url() === 'about:blank' || isAzurePortalUrl(candidate.url()) || isAzureSignInUrl(candidate.url())) {
                    signInPages.push(candidate);
                }
                if (isAzurePortalUrl(candidate.url()) &&
                    await candidate.getByRole('heading', { name: /\bUnsaved Workbook\b/ }).count() === 1 &&
                    await candidate.locator('iframe[name="Workbooks.ReactView"]').contentFrame()
                        .getByRole('textbox', { name: 'Editor content', exact: true }).count() === 1) {
                    candidates.push(candidate);
                }
            }
        }
        if (!candidates.length && input.options.tenant?.useBrowserSession && signInPages.length === 1) {
            const result = await openAzurePortal(signInPages[0], input.options.tenant);
            throw new Error(`PAUSED: ${result.guidance} No workbook was validated.`);
        }
        if (candidates.length !== 1) {
            throw new Error(`Open exactly one new empty unsaved workbook in Advanced Editor; found ${candidates.length} eligible pages.`);
        }
        page = candidates[0];
    });

    after(async function () {
        if (browser) {
            // This client creates no contexts; closing a connected browser disconnects this client.
            await browser.close();
        }
    });

    it('imports the exact source and checks primary tabs and requested contracts', async function () {
        const report = await validateWorkbookInBrowser(page, input.source, input.options);
        console.log(JSON.stringify(report, null, 2));
    });
});
