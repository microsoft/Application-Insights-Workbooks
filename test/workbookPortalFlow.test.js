const assert = require('chai').assert;
const { rejects } = require('node:assert/strict');
const vm = require('vm');
const {
    isAzureSignInUrl,
    normalizeTenantSelection,
    requireConfirmedTenant,
    verifySelectedTenant,
    portalSelectionPrompt,
    openAzurePortal,
    createPortalScript,
    loadValidationInput
} = require('./browser/workbookBrowserValidator');
const path = require('path');

const tenantId = '11111111-2222-3333-4444-555555555555';
const browserSelection = { useBrowserSession: true };

function portalPage({ url = 'about:blank', destination = 'https://portal.azure.com/#home',
    prompt, ids = [tenantId], readyPrompt, accountVisible = true } = {}) {
    const state = { url, prompt, navigations: [], interactions: 0, waited: false, disposed: false };
    const page = {
        url: () => state.url,
        async goto(url, options) {
            state.navigations.push({ url, options });
            state.url = destination;
        },
        async waitForFunction() {
            state.waited = true;
            if (readyPrompt) state.prompt = readyPrompt;
            return { async dispose() { state.disposed = true; } };
        },
        getByText(pattern) {
            return {
                filter(options) {
                    assert.isTrue(options.visible);
                    return this;
                },
                count: async () => state.prompt && pattern.test(state.prompt) ? 1 : 0
            };
        },
        getByRole(role, options) {
            assert.equal(role, 'button');
            assert.match('Account menu', options.name);
            return {
                count: async () => 1,
                isVisible: async () => accountVisible,
                locator(selector) {
                    assert.equal(selector, '[title]');
                    return {
                        evaluateAll: async callback => callback(ids.map(id => ({
                            getAttribute: () => `Directory: Offline fixture (${id}) Domain: example.invalid`
                        })))
                    };
                },
                async click() { state.interactions++; },
                async press() { state.interactions++; }
            };
        }
    };
    return { page, state };
}

describe('Validating browser-driven Azure sign-in...', () => {
    it('allows only an explicit browser-session opt-in, not an implicit default or mixed selection', () => {
        assert.deepEqual(requireConfirmedTenant(browserSelection), browserSelection);
        assert.throws(() => requireConfirmedTenant(), /PAUSED/);
        for (const invalid of [{ useBrowserSession: false }, { useBrowserSession: 'true' },
            { useBrowserSession: true, id: tenantId }, { useBrowserSession: true, confirmed: false }]) {
            assert.throws(() => normalizeTenantSelection(invalid), /tenant must contain/);
        }
    });

    it('opens Azure Portal from a blank external page and pauses at an account chooser without any click', async () => {
        const fixture = portalPage({
            destination: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
            prompt: 'Pick an account'
        });
        const report = await openAzurePortal(fixture.page);
        assert.equal(report.status, 'paused');
        assert.equal(report.reason, 'account-selection');
        assert.isFalse(report.workbookValidated);
        assert.deepEqual(fixture.state.navigations.map(item => item.url), ['https://portal.azure.com/']);
        assert.equal(fixture.state.interactions, 0);
    });

    it('pauses at sign-in without choosing credentials, an account, or a tenant', async () => {
        const fixture = portalPage({ url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize' });
        const report = await openAzurePortal(fixture.page);
        assert.equal(report.status, 'paused');
        assert.equal(report.reason, 'sign-in');
        assert.deepEqual(fixture.state.navigations, []);
        assert.equal(fixture.state.interactions, 0);
    });

    it('pauses at a visible directory chooser even if account-menu metadata is available', async () => {
        const fixture = portalPage({ url: 'https://portal.azure.com/#home', prompt: 'Select a directory' });
        const report = await openAzurePortal(fixture.page);
        assert.equal(report.status, 'paused');
        assert.equal(report.reason, 'tenant-selection');
        await rejects(verifySelectedTenant(fixture.page, browserSelection), /choice is pending/);
        assert.equal(fixture.state.interactions, 0);
    });

    it('waits for portal readiness and rechecks a chooser that appears while loading', async () => {
        const fixture = portalPage({ readyPrompt: 'Choose a tenant' });
        const report = await openAzurePortal(fixture.page);
        assert.equal(report.status, 'paused');
        assert.isTrue(fixture.state.waited);
        assert.isTrue(fixture.state.disposed);
        assert.equal(fixture.state.interactions, 0);
    });

    it('continues an already-authenticated session without a separate tenant form or account selection', async () => {
        const fixture = portalPage();
        const report = await openAzurePortal(fixture.page);
        assert.equal(report.status, 'ready');
        assert.isTrue(report.tenantVerified);
        assert.isFalse(report.workbookValidated);
        assert.notInclude(JSON.stringify(report), tenantId);
        assert.equal(fixture.state.interactions, 0);
    });

    it('does not navigate away from an existing portal workbook or restart an active sign-in page', async () => {
        for (const url of ['https://portal.azure.com/#view/Workbook', 'https://login.microsoftonline.com/']) {
            const fixture = portalPage({ url });
            await openAzurePortal(fixture.page);
            assert.deepEqual(fixture.state.navigations, []);
        }
    });

    it('refuses to replace an unrelated external browser tab', async () => {
        const fixture = portalPage({ url: 'https://example.invalid/' });
        await rejects(openAzurePortal(fixture.page), /Other pages will not be replaced/);
        assert.deepEqual(fixture.state.navigations, []);
        assert.equal(fixture.state.interactions, 0);
    });

    it('never relaxes an explicit expected-tenant constraint in browser navigation', async () => {
        const fixture = portalPage({ url: 'https://portal.azure.com/#home' });
        await rejects(openAzurePortal(fixture.page, {
            id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', confirmed: true
        }), /signed-in tenant is different/);
        assert.equal(fixture.state.interactions, 0);
    });

    it('requires an unambiguous directory and returns a private pin for later checks', async () => {
        const fixture = portalPage({ url: 'https://portal.azure.com/#home' });
        assert.deepEqual(await verifySelectedTenant(fixture.page, browserSelection), { id: tenantId, confirmed: true });
        for (const ids of [[], [tenantId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']]) {
            const ambiguous = portalPage({ url: 'https://portal.azure.com/#home', ids });
            await rejects(verifySelectedTenant(ambiguous.page, browserSelection), /cannot be matched/);
        }
    });

    it('does not use cached account metadata when the account control is hidden', async () => {
        const fixture = portalPage({ url: 'https://portal.azure.com/', accountVisible: false });
        await rejects(verifySelectedTenant(fixture.page, browserSelection), /Cannot verify/);
        assert.equal(fixture.state.interactions, 0);
    });

    it('rejects invalid timeouts or missing strict approval before touching the page', async () => {
        const untouched = { url() { throw new Error('Unexpected browser access'); } };
        await rejects(openAzurePortal(untouched, { id: tenantId }), /PAUSED/);
        for (const timeout of [0, -1, 120001, '30000']) {
            await rejects(openAzurePortal(untouched, browserSelection, timeout), /timeout must/);
        }
    });

    it('recognizes official sign-in hosts without accepting look-alike or credentialed URLs', () => {
        for (const url of ['https://login.microsoftonline.com/', 'https://login.microsoftonline.us/',
            'https://login.partner.microsoftonline.cn/', 'https://login.chinacloudapi.cn/']) {
            assert.isTrue(isAzureSignInUrl(url));
        }
        for (const url of ['http://login.microsoftonline.com/', 'https://login.microsoftonline.com.example/',
            'https://account@example.invalid/']) {
            assert.isFalse(isAzureSignInUrl(url));
        }
    });

    it('emits a self-contained portal function that reports pause rather than a false validation pass', async () => {
        const script = createPortalScript();
        const run = vm.runInNewContext(`(${script})`);
        assert.notInclude(script, "require('");
        const fixture = portalPage({ destination: 'https://login.microsoftonline.com/', prompt: 'Pick an account' });
        const report = await run(fixture.page);
        assert.equal(report.status, 'paused');
        assert.isFalse(report.workbookValidated);
    });

    it('normalizes account and tenant chooser text without inspecting account identities', async () => {
        for (const [prompt, reason] of [['Pick an account', 'account-selection'],
            ['Choose account', 'account-selection'], ['Select a directory', 'tenant-selection'],
            ['Switch tenant', 'tenant-selection'], ['Choose an organization', 'tenant-selection']]) {
            const fixture = portalPage({ url: 'https://portal.azure.com/', prompt });
            assert.equal(await portalSelectionPrompt(fixture.page), reason);
        }
    });

    it('keeps browser-session workflow opt-in separate from strict tenant and screenshot approval', () => {
        const fixturePath = path.join(__dirname, 'browser', 'fixtures', 'Smoke.workbook');
        const input = loadValidationInput(fixturePath, undefined, undefined, { useBrowserTenant: true });
        assert.deepEqual(input.options.tenant, browserSelection);
        assert.isUndefined(input.options.screenshots);
        assert.throws(() => loadValidationInput(fixturePath, undefined, undefined, { useBrowserTenant: 'true' }), /boolean/);
        assert.throws(() => loadValidationInput(fixturePath, undefined, undefined, {
            useBrowserTenant: true, tenantId, confirmTenant: true
        }), /not both/);
    });
});
