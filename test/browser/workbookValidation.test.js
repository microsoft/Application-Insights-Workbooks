const {
    isAzurePortalUrl,
    isAzureSignInUrl,
    loadValidationInput,
    createValidationPlan,
    validateCdpEndpoint,
    requireConfirmedTenant,
    openAzurePortal,
    validateWorkbookWithReport
} = require('./workbookBrowserValidator');
const { createValidationReport, recordValidationCheck, finishValidationReport,
    readValidationProvenance, writeValidationReport } = require('./workbookValidationReport');

describe('Validating workbook browser behavior (opt-in)...', function () {
    let browser;
    let page;
    let input;
    let provenance;

    function publish(report) {
        if (process.env.WORKBOOK_BROWSER_REPORT !== undefined) {
            writeValidationReport(report, process.env.WORKBOOK_BROWSER_REPORT);
        }
        console.log(JSON.stringify(report, null, 2));
    }

    before(async function () {
        let report = createValidationReport();
        let area = 'source';
        let reason;
        try {
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
            provenance = readValidationProvenance(process.env.WORKBOOK_BROWSER_TEMPLATE, input.source,
                createValidationPlan(input.source, input.options));
            report = createValidationReport(provenance);
            area = 'authentication';
            requireConfirmedTenant(input.options.tenant);
            area = 'browser';
            const endpoint = validateCdpEndpoint(process.env.WORKBOOK_BROWSER_CDP_ENDPOINT);
            const { chromium } = require('playwright-core');
            browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
            recordValidationCheck(report, 'browser-session', 'browser', 'passed', 'automated', { assertions: 1 });
            area = 'source';
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
                area = 'authentication';
                const result = await openAzurePortal(signInPages[0], input.options.tenant);
                if (result.status === 'ready') {
                    recordValidationCheck(report, 'authenticated-session', 'authentication', 'passed', 'automated', { assertions: 1 });
                    area = 'source';
                    reason = 'editor-not-ready';
                } else {
                    reason = result.reason;
                }
                throw new Error(`PAUSED: ${result.guidance} No workbook was validated.`);
            }
            if (candidates.length !== 1) {
                reason = 'editor-not-ready';
                throw new Error(`Open exactly one new empty unsaved workbook in Advanced Editor; found ${candidates.length} eligible pages.`);
            }
            page = candidates[0];
        } catch (error) {
            const blocked = /^PAUSED:/.test(error.message) || reason === 'editor-not-ready';
            const id = { source: 'exact-source', browser: 'browser-session',
                authentication: 'authenticated-session' }[area];
            recordValidationCheck(report, id, area, blocked ? 'blocked' : 'failed', 'automated', {},
                reason || (blocked ? 'authorization-required' : area === 'browser' ? 'browser-unavailable' : 'automation-error'));
            publish(finishValidationReport(report, blocked ? 'blocked' : 'failed'));
            throw error;
        }
    });

    after(async function () {
        if (browser) {
            // This client creates no contexts; closing a connected browser disconnects this client.
            await browser.close();
        }
    });

    it('imports the exact source and checks primary tabs and requested contracts', async function () {
        let failure;
        const report = await validateWorkbookWithReport(page, input.source, input.options, provenance,
            error => { failure = error; });
        publish(report);
        if (report.automationStatus !== 'passed') {
            throw failure || new Error(`Workbook automation ${report.automationStatus}; see the validation report.`);
        }
    });
});
