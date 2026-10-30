const {
    isAzurePortalUrl,
    loadValidationInput,
    validateCdpEndpoint,
    validateWorkbookInBrowser
} = require('./workbookBrowserValidator');

describe('Validating workbook browser behavior (opt-in)...', function () {
    let browser;
    let page;
    let input;

    before(async function () {
        input = loadValidationInput(process.env.WORKBOOK_BROWSER_TEMPLATE, process.env.WORKBOOK_BROWSER_CHECKS);
        const endpoint = validateCdpEndpoint(process.env.WORKBOOK_BROWSER_CDP_ENDPOINT);
        const { chromium } = require('playwright-core');
        browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
        const candidates = [];
        for (const context of browser.contexts()) {
            for (const candidate of context.pages()) {
                if (isAzurePortalUrl(candidate.url()) &&
                    await candidate.getByRole('heading', { name: /\bUnsaved Workbook\b/ }).count() === 1 &&
                    await candidate.locator('iframe[name="Workbooks.ReactView"]').contentFrame()
                        .getByRole('textbox', { name: 'Editor content', exact: true }).count() === 1) {
                    candidates.push(candidate);
                }
            }
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
