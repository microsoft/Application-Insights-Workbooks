const assert = require('chai').assert;
const { rejects } = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { Validator } = require('jsonschema');
const {
    isAzurePortalUrl,
    normalizeTenantSelection,
    requireConfirmedTenant,
    verifySelectedTenant,
    normalizeScreenshotOptions,
    createValidationPlan,
    markScreenshotMasks,
    screenshotRedactionStyle,
    applyScreenshotRedaction,
    isolateWorkbookFrame,
    captureMaskedScreenshot,
    captureWorkbookScreenshot,
    readGridSummary,
    activateWorkbookControl,
    bindParameterTrigger,
    validateWorkbookInBrowser: validateWithExplicitTenant,
    loadValidationInput,
    validateCdpEndpoint,
    createPlaywrightScript
} = require('./browser/workbookBrowserValidator');

const fixturePath = path.join(__dirname, 'browser', 'fixtures', 'Smoke.workbook');
const checksPath = path.join(__dirname, 'browser', 'fixtures', 'smoke-checks.json');
const source = fs.readFileSync(fixturePath, 'utf8');
const checks = JSON.parse(fs.readFileSync(checksPath, 'utf8'));
const emptySource = JSON.stringify({ version: 'Notebook/1.0', items: [] });
const testTenant = { id: '11111111-2222-3333-4444-555555555555', confirmed: true };
const otherTenantId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function validateWorkbookInBrowser(page, workbookSource, options = {}) {
    return validateWithExplicitTenant(page, workbookSource, { tenant: testTenant, ...options });
}

function accountPage(ids = [testTenant.id], titleFactory) {
    return {
        url: () => 'https://portal.azure.com/#home',
        getByText: () => ({
            filter() { return this; },
            count: async () => 0
        }),
        getByRole(role) {
            assert.equal(role, 'button');
            return {
                count: async () => 1,
                isVisible: async () => true,
                locator(selector) {
                    assert.equal(selector, '[title]');
                    return {
                        evaluateAll: async callback => callback(ids.map(id => ({
                            getAttribute: () => titleFactory ? titleFactory(id) :
                                `Name: Synthetic account Directory: Synthetic directory (${id}) Domain: example.invalid`
                        })))
                    };
                }
            };
        }
    };
}

function parameterToolbar(trigger, labels = ['Show details']) {
    const toolbar = {
        count: async () => 1,
        getByRole(role, options = {}) {
            assert.equal(role, 'menuitem');
            if (options.name) return trigger;
            return { evaluateAll: async callback => callback(labels.map(label => ({
                getAttribute: () => label, textContent: label
            }))) };
        }
    };
    trigger.locator = selector => {
        assert.equal(selector, 'xpath=ancestor::*[@role="menubar"][1]');
        return toolbar;
    };
    return toolbar;
}

function changedSource(change) {
    const workbook = JSON.parse(source);
    change(workbook);
    return JSON.stringify(workbook);
}

function editorPage(existingSource, editorCount = 1, unsaved = true) {
    const state = { value: existingSource, writes: 0, clicks: [], backgroundModelAccess: 0, readingToolbarConfirmed: false };
    const inputElement = {};
    const model = {
        getValue: () => state.value,
        setValue(value) {
            state.writes++;
            state.value = value;
        }
    };
    const backgroundEditor = {
        getDomNode: () => ({ contains: () => false }),
        getModel() {
            state.backgroundModelAccess++;
            throw new Error('An unrelated cached editor must not be accessed.');
        }
    };
    const editors = [backgroundEditor, ...Array.from({ length: editorCount }, () => ({
        getDomNode: () => ({ contains: element => element === inputElement }),
        getModel: () => model
    }))];
    const frame = {
        getByRole(role, options = {}) {
            if (role === 'menubar') {
                assert.match('Workbooks toolbar. Use left and right arrow keys to navigate between commands', options.name);
                return {
                    getByRole(role, options) {
                        assert.equal(role, 'menuitem');
                        assert.equal(options.name, 'Edit');
                        return { async waitFor() { state.readingToolbarConfirmed = true; } };
                    }
                };
            }
            if (role === 'menuitem' && options.name === 'Edit') {
                throw new Error('Unscoped Edit also matches transient step-level commands.');
            }
            return {
                async waitFor() {},
                async isEnabled() { return true; },
                async press(key) { assert.equal(key, 'Enter'); state.clicks.push(options.name); },
                first() { return this; },
                async evaluate(callback, argument) {
                    const evaluate = vm.runInNewContext(`(${callback.toString()})`, {
                        globalThis: { monaco: { editor: {
                            getModels() { throw new Error('Do not select a model from the global cache.'); },
                            getEditors: () => editors
                        } } },
                        crypto: crypto.webcrypto,
                        TextEncoder
                    });
                    return evaluate(inputElement, argument);
                }
            };
        }
    };
    const page = {
        url: () => 'https://portal.azure.com/#home',
        getByText: (...args) => accountPage().getByText(...args),
        getByRole: (role, options) => role === 'button' ? accountPage().getByRole(role, options) :
            ({ count: async () => unsaved ? 1 : 0 }),
        locator: () => ({ contentFrame: () => frame })
    };
    return { page, state, frame };
}

function sharedDeferredEditor(initialHeadings = []) {
    const workbook = JSON.parse(source);
    const group = workbook.items.find(item => item.name === 'browser_fixture_group');
    delete group.conditionalVisibility;
    workbook.items = [workbook.items[0], group];
    const editor = editorPage(emptySource);
    const original = editor.frame.getByRole.bind(editor.frame);
    let loaded = false;
    let clicks = 0;
    const trigger = {
        or() { return this; },
        async waitFor(options) {
            if (options.state === 'hidden') assert.isTrue(loaded);
        },
        async isEnabled() { return true; },
        async scrollIntoViewIfNeeded() {},
        async isEnabled() { return true; },
        async press(key) {
            assert.equal(key, 'Enter');
            clicks++;
            loaded = true;
        }
    };
    editor.frame.getByRole = (role, options = {}) => {
        if (role === 'menubar' && !options.name) return parameterToolbar(trigger);
        if (options.name === 'Show details') return trigger;
        if (role === 'heading' && ['Deferred table', 'Loaded details'].includes(options.name)) {
            return {
                count: async () => loaded || initialHeadings.includes(options.name) ? 1 : 0,
                async waitFor() { assert.isTrue(loaded); }
            };
        }
        return original(role, options);
    };
    return { ...editor, source: JSON.stringify(workbook), triggerClicks: () => clicks };
}

describe('Validating browser validator contracts...', () => {
    it('uses a schema-valid fixture containing only inline JSON, text, and parameter actions', () => {
        const workbook = JSON.parse(source);
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'workbook.json'), 'utf8'));
        const result = new Validator().validate(workbook, schema);
        assert.isTrue(result.valid, result.errors.map(error => error.stack).join('\n'));
        const items = [];
        function collect(entries) {
            for (const item of entries) {
                items.push(item);
                if (item.type === 12) collect(item.content.items);
            }
        }
        collect(workbook.items);
        assert.isTrue(items.every(item => [1, 3, 9, 11, 12].includes(item.type)));
        assert.isTrue(items.filter(item => item.type === 3).every(item => item.content.queryType === 8));
        assert.isTrue(items.filter(item => item.type === 11)
            .every(item => item.content.links.every(link => link.linkTarget === 'parameter')));
        const group = workbook.items.find(item => item.name === 'browser_fixture_group');
        const query = group.content.items.find(item => item.type === 3);
        assert.equal(query.content.queryType, 8);
        const envelope = JSON.parse(query.content.query);
        assert.equal(envelope.version, '1.0.0');
        assert.deepEqual(JSON.parse(envelope.content), [{ Label: 'First', Count: 1 }, { Label: 'Second', Count: 2 }]);
        assert.isNull(envelope.transformers);
    });

    it('normalizes a BOM and Windows line endings without changing the source content', () => {
        const normalized = source.replace(/\r\n/g, '\n');
        assert.equal(createValidationPlan('\uFEFF' + normalized.replace(/\n/g, '\r\n'), checks).source, normalized);
    });

    it('infers primary tab labels and scopes requested grid assertions', () => {
        const plan = createValidationPlan(source, { deferred: checks.deferred });
        assert.deepEqual(plan.tabs, ['Overview', 'Details']);
        assert.equal(plan.itemCount, 8);
        assert.equal(plan.deferred[0].tab, 'Overview');
        assert.equal(plan.deferred[0].minRows, 2);
        assert.equal(plan.deferred[0].maxRows, 2);
        assert.deepEqual(plan.deferred[0].columns, ['Label', 'Count']);
        assert.isFalse(plan.screenshots);
    });

    it('groups contracts by both tab and parameter-action trigger', () => {
        const plan = createValidationPlan(source, checks);
        assert.lengthOf(plan.deferredGroups, 1);
        assert.lengthOf(plan.deferredGroups[0].checks, 2);
        assert.deepEqual(plan.deferredGroups[0].checks.map(check => check.heading), ['Deferred table', 'Loaded details']);
        const differentTabs = createValidationPlan(source, {
            deferred: [...checks.deferred, { ...checks.deferred[0], tab: 'Details' }]
        });
        assert.deepEqual(differentTabs.deferredGroups.map(group => [group.tab, group.trigger, group.checks.length]),
            [['Overview', 'Show details', 2], ['Details', 'Show details', 1]]);
    });

    it('uses total ARIA rows and normalizes display headers without inspecting record values', () => {
        const grid = {
            getAttribute(name) {
                assert.equal(name, 'aria-rowcount');
                return '101';
            },
            querySelectorAll(selector) {
                assert.equal(selector, '[role="columnheader"]');
                return [{ textContent: '\uE001' }, { textContent: '\uE001  First\n column ' },
                    { textContent: ' Count\t total ' }];
            }
        };
        assert.deepEqual(readGridSummary(grid), { rows: 100, columns: ['First column', 'Count total'] });
    });

    it('rejects unknown virtualized row counts instead of falling back to rendered rows', () => {
        for (const count of [null, '', '-1', 'unknown', '0', '2.5', '9007199254740993']) {
            assert.throws(() => readGridSummary({ getAttribute: () => count }), /reliable aria-rowcount/);
        }
    });

    it('rejects invalid source and workbook versions before browser interaction', () => {
        assert.throws(() => createValidationPlan('not JSON'), /valid JSON/);
        assert.throws(() => createValidationPlan('{}'), /Notebook\/1.0/);
        assert.throws(() => createValidationPlan(''), /non-empty JSON/);
        assert.throws(() => createValidationPlan(JSON.stringify({ version: 'Notebook/1.0', items: {} })), /items array/);
    });

    it('rejects unknown options and mistyped contracts rather than silently ignoring them', () => {
        assert.throws(() => createValidationPlan(source, { headers: {} }), /unsupported option/);
        assert.throws(() => createValidationPlan(source, { deferred: {} }), /deferred must be an array/);
        assert.throws(() => createValidationPlan(source, { deferred: [{ ...checks.deferred[0], rowLimit: 2 }] }), /unsupported option/);
        assert.throws(() => createValidationPlan(source, { tabs: ['Overview', 'Overview'] }), /unique labels/);
        assert.throws(() => createValidationPlan(source, { deferred: [{ ...checks.deferred[0], tab: 'Unknown' }] }), /primary tabset/);
    });

    it('rejects invalid timeouts, row bounds, columns, and producer expectations', () => {
        for (const timeout of [0, -1, 120001, 0.5, '30000']) {
            assert.throws(() => createValidationPlan(source, { timeout }), /timeout must/);
        }
        for (const invalid of [{ minRows: -1 }, { maxRows: '2' }, { minRows: 3, maxRows: 2 },
            { columns: [] }, { hideTriggerAfterLoad: 'true' }]) {
            assert.throws(() => createValidationPlan(source, {
                deferred: [{ ...checks.deferred[0], ...invalid }]
            }));
        }
    });

    it('does not automatically navigate external or ARM-action tabs', () => {
        const unsafe = changedSource(workbook => { workbook.items[1].content.links[0].linkTarget = 'ArmAction'; });
        assert.throws(() => createValidationPlan(unsafe), /parameter links only/);
    });

    it('does not allow a secondary tabset to bypass the parameter-only navigation guard', () => {
        const unsafe = changedSource(workbook => {
            workbook.items.push({
                type: 11,
                name: 'additional_tabs',
                content: {
                    version: 'LinkItem/1.0',
                    style: 'tabs',
                    links: [{ linkLabel: 'External', linkTarget: 'url', cellValue: 'https://example.invalid/' }]
                }
            });
        });
        assert.throws(() => createValidationPlan(unsafe), /parameter links only/);
    });

    it('requires explicit expected tab labels for parameterized labels', () => {
        const dynamic = changedSource(workbook => { workbook.items[1].content.links[0].linkLabel = '{DynamicLabel}'; });
        assert.throws(() => createValidationPlan(dynamic), /explicit tabs/);
        assert.deepEqual(createValidationPlan(dynamic, { tabs: ['Overview', 'Details'] }).tabs, ['Overview', 'Details']);
    });

    it('restricts deferred triggers to unique parameter links', () => {
        const external = changedSource(workbook => {
            workbook.items[3].content.items[0].content.links[0].linkTarget = 'OpenBlade';
        });
        assert.throws(() => createValidationPlan(external, checks), /one parameter link/);
        const duplicate = changedSource(workbook => {
            const links = workbook.items[3].content.items[0].content.links;
            links.push({ ...links[0], id: 'another-link' });
        });
        assert.throws(() => createValidationPlan(duplicate, checks), /one parameter link/);
    });

    it('requires a static source-defined toolbar instead of binding a same-label generic link', () => {
        const plainLink = changedSource(workbook => {
            workbook.items[3].content.items[0].content.style = 'links';
        });
        assert.throws(() => createValidationPlan(plainLink, checks), /source-defined toolbar/);
        const dynamicToolbar = changedSource(workbook => {
            workbook.items[3].content.items[0].content.links.push({
                linkLabel: '{Dynamic}', linkTarget: 'parameter', cellValue: 'Other', subTarget: 'true'
            });
        });
        assert.throws(() => createValidationPlan(dynamicToolbar, checks), /static link labels/);
    });

    it('verifies the entire runtime toolbar before returning a deferred trigger', async () => {
        const trigger = { async waitFor() {} };
        const toolbar = parameterToolbar(trigger);
        const frame = {
            getByRole(role) {
                assert.equal(role, 'menubar');
                return toolbar;
            }
        };
        assert.equal(await bindParameterTrigger(frame, { trigger: 'Show details', toolbarLabels: ['Show details'] }, 30000), trigger);
        await rejects(bindParameterTrigger(frame, {
            trigger: 'Show details', toolbarLabels: ['Show details', 'Missing action']
        }, 30000), /differs from the validated source/);
        toolbar.count = async () => 0;
        await rejects(bindParameterTrigger(frame, {
            trigger: 'Show details', toolbarLabels: ['Show details']
        }, 30000), /Cannot bind/);
    });

    it('catches a self-referential visibility export without a preceding global', () => {
        const local = changedSource(workbook => { workbook.items[0].content.parameters[0].isGlobal = false; });
        assert.throws(() => createValidationPlan(local, checks), /global before the producer/);
        const late = changedSource(workbook => { workbook.items.push(workbook.items.shift()); });
        assert.throws(() => createValidationPlan(late, checks), /global before the producer/);
    });

    it('respects globals in ancestor scopes without leaking private sibling-group declarations', () => {
        const localGroup = changedSource(workbook => {
            const parameters = workbook.items.shift();
            workbook.items.find(item => item.name === 'browser_fixture_group').content.items.unshift(parameters);
        });
        assert.equal(createValidationPlan(localGroup, checks).deferred.length, checks.deferred.length);
        const privateGroup = changedSource(workbook => {
            const parameters = workbook.items.shift();
            workbook.items.unshift({
                type: 12, name: 'private_parameters',
                content: { version: 'NotebookGroup/1.0', groupType: 'editable', items: [parameters] }
            });
        });
        assert.throws(() => createValidationPlan(privateGroup, checks), /global before the producer/);
        const exported = JSON.parse(privateGroup);
        exported.items[0].content.exportParameters = true;
        assert.equal(createValidationPlan(JSON.stringify(exported), checks).deferred.length, checks.deferred.length);
    });

    it('does not require a self-hiding global when producer hiding was not requested', () => {
        const local = changedSource(workbook => { workbook.items[0].content.parameters[0].isGlobal = false; });
        const options = { deferred: [{ ...checks.deferred[0], hideTriggerAfterLoad: false }] };
        assert.equal(createValidationPlan(local, options).deferred.length, 1);
    });

    it('recognizes only official Azure portal HTTPS origins', () => {
        for (const url of ['https://portal.azure.com/#home', 'https://portal.azure.us/', 'https://portal.azure.cn/']) {
            assert.isTrue(isAzurePortalUrl(url));
        }
        for (const url of ['http://portal.azure.com/', 'https://portal.azure.com.example/', 'https://login.microsoftonline.com/']) {
            assert.isFalse(isAzurePortalUrl(url));
        }
    });

    it('accepts only credential-free loopback HTTP CDP endpoints', () => {
        for (const endpoint of ['http://localhost:9222', 'http://127.0.0.1:9222/', 'http://[::1]:9222/']) {
            assert.match(validateCdpEndpoint(endpoint), /^http:/);
        }
        for (const endpoint of [undefined, 'not a URL', 'https://remote.example/', 'http://user:token@localhost:9222/',
            'http://localhost:9222/?token=secret', 'http://localhost:9222/#secret', 'http://localhost:9222/private',
            'http://localhost:0/', 'http://127.0.0.1.example:9222/']) {
            assert.throws(() => validateCdpEndpoint(endpoint), /loopback HTTP/);
        }
    });

    it('requires explicit source configuration and validates profile input', () => {
        assert.throws(() => loadValidationInput(), /WORKBOOK_BROWSER_TEMPLATE/);
        assert.throws(() => loadValidationInput(fixturePath, ''), /checks file/);
        const input = loadValidationInput(fixturePath, checksPath);
        assert.equal(input.source, source);
        assert.deepEqual(input.options, checks);
    });

    it('rejects sign-in redirects without touching a browser control', async () => {
        await rejects(validateWorkbookInBrowser({ url: () => 'https://login.microsoftonline.com/' }, source, checks), /Sign in to Azure/);
    });

    it('refuses saved and non-empty workbook editors without modifying them', async () => {
        const saved = editorPage(emptySource, 1, false);
        await rejects(validateWorkbookInBrowser(saved.page, emptySource), /new empty unsaved workbook/);
        assert.equal(saved.state.writes, 0);
        const filled = editorPage(source);
        await rejects(validateWorkbookInBrowser(filled.page, emptySource), /not an empty workbook/);
        assert.equal(filled.state.writes, 0);
        assert.deepEqual(filled.state.clicks, []);
    });

    it('rejects missing or ambiguous active editors without replacing content', async () => {
        for (const count of [0, 2]) {
            const editor = editorPage(emptySource, count);
            await rejects(validateWorkbookInBrowser(editor.page, emptySource), /one active Advanced Editor/);
            assert.equal(editor.state.writes, 0);
        }
    });

    it('round-trips exact source without touching cached editors or invoking Save', async () => {
        const editor = editorPage(emptySource);
        const report = await validateWorkbookInBrowser(editor.page, emptySource);
        assert.equal(editor.state.writes, 1);
        assert.equal(editor.state.value, emptySource);
        assert.equal(editor.state.backgroundModelAccess, 0);
        assert.deepEqual(editor.state.clicks, ['Apply', 'Done Editing']);
        assert.equal(report.sourceSha256, crypto.createHash('sha256').update(emptySource).digest('hex'));
        assert.deepEqual(report.tabsVisited, []);
        assert.equal(report.dataContractsChecked, 0);
        assert.equal(report.parameterActionsClicked, 0);
        assert.include(report.coverage, 'no-data is not proof of health');
        assert.isFalse(report.workbookSaved);
        assert.isTrue(report.tenantVerified);
        assert.notInclude(JSON.stringify(report), testTenant.id);
        assert.notInclude(JSON.stringify(report), emptySource);
        assert.isFalse(report.screenshots.enabled);
        assert.deepEqual(report.screenshots.captures, []);
        assert.include(report.screenshots.guidance, 'auto redaction by default');
    });

    it('waits for the workbook toolbar rather than transient step Edit commands', async () => {
        const editor = editorPage(emptySource);
        await validateWorkbookInBrowser(editor.page, emptySource);
        assert.isTrue(editor.state.readingToolbarConfirmed);
    });

    it('activates tabs with the native keyboard path and confirms the selected state', async () => {
        const editor = editorPage(emptySource);
        const original = editor.frame.getByRole.bind(editor.frame);
        const activated = [];
        let selected;
        const tablist = {
            first() { return this; },
            async waitFor() {},
            getByRole(role, options = {}) {
                assert.equal(role, 'tab');
                if (!options.name) return { allTextContents: async () => ['Overview', 'Details'] };
                return {
                    async isEnabled() { return true; },
                    async press(key) {
                        assert.equal(key, 'Enter');
                        selected = options.name;
                        activated.push(selected);
                    },
                    async waitFor() {
                        if (options.selected) assert.equal(selected, options.name);
                    }
                };
            }
        };
        editor.frame.getByRole = (role, options) => role === 'tablist' ? tablist : original(role, options);
        const report = await validateWorkbookInBrowser(editor.page, source);
        assert.deepEqual(activated, ['Overview', 'Details']);
        assert.deepEqual(report.tabsVisited, activated);
    });

    it('checks initial absence after the trigger becomes ready, before clicking it', async () => {
        const workbook = JSON.parse(source);
        const group = workbook.items.find(item => item.name === 'browser_fixture_group');
        delete group.conditionalVisibility;
        delete group.content.items.find(item => item.type === 3).conditionalVisibility;
        workbook.items = [workbook.items[0], group];
        const editor = editorPage(emptySource);
        const original = editor.frame.getByRole.bind(editor.frame);
        let mounted = false;
        let clicked = false;
        const trigger = {
            or() { return this; },
            async waitFor() { mounted = true; },
            async scrollIntoViewIfNeeded() {},
            async isEnabled() { return true; },
            async press() { clicked = true; }
        };
        editor.frame.getByRole = (role, options = {}) => {
            if (role === 'menubar' && !options.name) return parameterToolbar(trigger);
            if (options.name === 'Show details') return trigger;
            if (role === 'heading' && options.name === 'Deferred table') {
                return { count: async () => mounted ? 1 : 0, async waitFor() {} };
            }
            return original(role, options);
        };
        await rejects(validateWorkbookInBrowser(editor.page, JSON.stringify(workbook), {
            deferred: [{ trigger: 'Show details', heading: 'Deferred table' }]
        }), /mounted before its trigger/);
        assert.isFalse(clicked);
    });

    it('never keyboard-activates a disabled workbook control', async () => {
        let activated = false;
        await rejects(activateWorkbookControl({
            async waitFor() {},
            isEnabled: async () => false,
            async press() { activated = true; }
        }, 30000), /control is disabled/);
        assert.isFalse(activated);
    });

    it('clicks a shared trigger once and validates all of its panels', async () => {
        const editor = sharedDeferredEditor();
        const report = await validateWorkbookInBrowser(editor.page, editor.source, {
            deferred: checks.deferred.map(({ trigger, heading }) => ({ trigger, heading, hideTriggerAfterLoad: true }))
        });
        assert.equal(editor.triggerClicks(), 1);
        assert.equal(report.parameterActionsClicked, 1);
        assert.lengthOf(report.deferredChecks, 2);
        assert.isTrue(report.deferredChecks.every(check => check.producerHidden));
    });

    it('checks every shared panel for eager content before any trigger click', async () => {
        const editor = sharedDeferredEditor(['Loaded details']);
        await rejects(validateWorkbookInBrowser(editor.page, editor.source, {
            deferred: checks.deferred.map(({ trigger, heading }) => ({ trigger, heading, hideTriggerAfterLoad: true }))
        }), /"Loaded details" was mounted before its trigger/);
        assert.equal(editor.triggerClicks(), 0);
    });

    it('emits a self-contained Playwright function without Node imports or credentials', async () => {
        const script = createPlaywrightScript(source, { ...checks, tenant: testTenant });
        const run = vm.runInNewContext(`(${script})`);
        assert.isFunction(run);
        assert.notInclude(script, "require('");
        assert.notInclude(script, 'process.env');
        await rejects(run({ url: () => 'https://login.microsoftonline.com/' }), /Sign in to Azure/);
    });

    it('serializes workbook text as data rather than executable script', async () => {
        const injected = changedSource(workbook => {
            workbook.items[2].content.json = '"); globalThis.injected = true; //';
        });
        const context = vm.createContext({});
        const run = vm.runInContext(`(${createPlaywrightScript(injected, { ...checks, tenant: testTenant })})`, context);
        await rejects(run({ url: () => 'https://login.microsoftonline.com/' }), /Sign in to Azure/);
        assert.isUndefined(context.injected);
    });
});

describe('Validating explicit tenant selection...', () => {
    it('never accesses a browser before a tenant is explicitly selected and confirmed', async () => {
        const page = { url() { throw new Error('Browser must not be accessed while waiting.'); } };
        for (const tenant of [undefined, { id: testTenant.id }, { id: testTenant.id, confirmed: false }]) {
            await rejects(validateWithExplicitTenant(page, emptySource, { tenant }), /PAUSED: Ask the user/);
        }
        assert.throws(() => createValidationPlan(source, { autopilot: true }), /unsupported option/);
    });

    it('normalizes a selected GUID without inferring confirmation or accepting invalid fields', () => {
        assert.deepEqual(normalizeTenantSelection({ id: ` ${otherTenantId.toUpperCase()} ` }),
            { id: otherTenantId, confirmed: false });
        assert.throws(() => requireConfirmedTenant({ id: testTenant.id }), /PAUSED/);
        for (const value of [false, {}, { id: 'not-a-guid', confirmed: true },
            { ...testTenant, confirmed: 'true' }, { ...testTenant, defaultTenant: true }]) {
            assert.throws(() => normalizeTenantSelection(value), /tenant must contain/);
        }
    });

    it('matches only the confirmed portal-directory GUID and never chooses another account', async () => {
        await verifySelectedTenant(accountPage(), testTenant);
        for (const ids of [[], [otherTenantId], [testTenant.id, otherTenantId]]) {
            await rejects(verifySelectedTenant(accountPage(ids), testTenant), error => {
                assert.include(error.message, 'PAUSED');
                assert.notInclude(error.message, testTenant.id);
                assert.notInclude(error.message, otherTenantId);
                return true;
            });
        }
    });

    it('rejects a confirmed GUID embedded in the directory display name when the actual GUID differs', async () => {
        const misleading = accountPage([otherTenantId],
            actual => `Directory: Demo (${testTenant.id}) (${actual}) Domain: example.invalid`);
        await rejects(verifySelectedTenant(misleading, testTenant), /cannot be matched/);
        await rejects(verifySelectedTenant(misleading, { useBrowserSession: true }), /cannot be matched/);
        const duplicate = accountPage([testTenant.id],
            actual => `Directory: Demo (${actual}) (${actual}) Domain: example.invalid`);
        assert.deepEqual(await verifySelectedTenant(duplicate, testTenant), testTenant);
    });

    it('pauses if tenant identity cannot be read instead of using the signed-in/default tenant', async () => {
        await rejects(verifySelectedTenant({
            url: () => 'https://portal.azure.com/#home',
            getByText: (...args) => accountPage().getByText(...args),
            getByRole: () => ({ count: async () => 0 })
        }, testTenant), /Cannot verify/);
    });

    it('stops tab execution when the selected directory changes after source import', async () => {
        const editor = editorPage(emptySource);
        let checks = 0;
        const account = accountPage([otherTenantId]);
        const original = editor.page.getByRole;
        editor.page.getByRole = (role, options) => role === 'button' && ++checks > 1 ?
            account.getByRole(role, options) : original(role, options);
        editor.frame.getByRole = ((original) => (role, options) => role === 'tablist' ? {
            first() { return this; },
            async waitFor() {},
            getByRole: () => ({ allTextContents: async () => ['Overview', 'Details'] })
        } : original(role, options))(editor.frame.getByRole.bind(editor.frame));
        await rejects(validateWorkbookInBrowser(editor.page, source), /signed-in tenant is different/);
        assert.equal(editor.state.writes, 1);
        assert.deepEqual(editor.state.clicks, ['Apply', 'Done Editing']);
    });

    it('pins the first browser-session tenant and rejects directory changes instead of following them', async () => {
        const editor = editorPage(emptySource);
        let verifications = 0;
        const original = editor.page.getByRole;
        editor.page.getByRole = (role, options) => role === 'button' && ++verifications > 1 ?
            accountPage([otherTenantId]).getByRole(role, options) : original(role, options);
        const originalFrameRole = editor.frame.getByRole.bind(editor.frame);
        editor.frame.getByRole = (role, options) => role === 'tablist' ? {
            first() { return this; },
            async waitFor() {},
            getByRole: () => ({ allTextContents: async () => ['Overview', 'Details'] })
        } : originalFrameRole(role, options);
        await rejects(validateWithExplicitTenant(editor.page, source, { tenant: { useBrowserSession: true } }),
            /signed-in tenant is different/);
        assert.deepEqual(editor.state.clicks, ['Apply', 'Done Editing']);
        assert.equal(editor.state.writes, 1);
    });

    it('emits a runner that pauses without touching a browser if approval is absent', async () => {
        const run = vm.runInNewContext(`(${createPlaywrightScript(source, checks)})`);
        await rejects(run({ url() { throw new Error('Unexpected browser access'); } }), /PAUSED: Ask the user/);
    });

    it('requires fresh confirmation when a CLI/environment override changes the tenant', () => {
        const input = loadValidationInput(fixturePath, checksPath, undefined,
            { tenantId: testTenant.id, confirmTenant: false });
        assert.isFalse(input.options.tenant.confirmed);
        assert.throws(() => requireConfirmedTenant(input.options.tenant), /PAUSED/);
        const confirmed = loadValidationInput(fixturePath, checksPath, undefined,
            { tenantId: testTenant.id, confirmTenant: true });
        assert.deepEqual(confirmed.options.tenant, testTenant);
    });

    it('fails before CDP connection when the opt-in Mocha runner has no tenant approval', () => {
        const env = {
            ...process.env,
            WORKBOOK_BROWSER_TEMPLATE: fixturePath,
            WORKBOOK_BROWSER_CHECKS: checksPath,
            WORKBOOK_BROWSER_CDP_ENDPOINT: 'http://127.0.0.1:1'
        };
        delete env.WORKBOOK_BROWSER_TENANT_ID;
        delete env.WORKBOOK_BROWSER_TENANT_CONFIRMED;
        delete env.WORKBOOK_BROWSER_USE_BROWSER_TENANT;
        delete env.WORKBOOK_BROWSER_SCREENSHOTS;
        delete env.WORKBOOK_BROWSER_REDACTION;
        delete env.WORKBOOK_BROWSER_ALLOW_SENSITIVE_CAPTURE;
        const result = spawnSync(process.execPath, [
            require.resolve('mocha/bin/mocha.js'), '--timeout', '10000',
            path.join(__dirname, 'browser', 'workbookValidation.test.js')
        ], { encoding: 'utf8', env, timeout: 15000 });
        assert.equal(result.status, 1, result.stderr);
        assert.include(result.stdout + result.stderr, 'PAUSED: Ask the user');
        assert.notInclude(result.stdout + result.stderr, 'ECONNREFUSED');
    });
});

describe('Validating optional screenshot safeguards...', () => {
    it('requires explicit local output and preserves disabled defaults', () => {
        assert.isFalse(createValidationPlan(source, { screenshots: false }).screenshots);
        assert.deepEqual(createValidationPlan(source, { screenshots: { directory: '.playwright-mcp/images' } }).screenshots,
            { directory: '.playwright-mcp/images', maskSelectors: [], redaction: 'auto', allowSensitiveCapture: false });
        for (const directory of ['', 'https://example.invalid/', '\\\\server\\share', '//server/share',
            '../outside', 'local\\..\\outside', 'local\ninvalid']) {
            assert.throws(() => createValidationPlan(source, { screenshots: { directory } }), /local directory/);
        }
        assert.throws(() => createValidationPlan(source, { screenshots: true }), /must be an object/);
        assert.throws(() => createValidationPlan(source, { screenshots: { directory: 'local', unmasked: true } }), /supported options/);
        assert.throws(() => createValidationPlan(source, {
            screenshots: { directory: 'local', maskSelectors: [''] }
        }), /CSS selectors/);
    });

    it('supports CLI/environment opt-in without discarding additional checks-file masks', () => {
        const input = loadValidationInput(fixturePath, checksPath, 'C:\\private-evidence');
        assert.equal(input.options.screenshots.directory, 'C:\\private-evidence');
        assert.deepEqual(input.options.deferred, checks.deferred);
    });

    it('never disables automatic redaction without explicit sensitive-capture approval', () => {
        for (const redaction of ['manual', 'ai-assisted', 'none']) {
            assert.throws(() => normalizeScreenshotOptions({
                directory: 'private', redaction, maskSelectors: redaction === 'none' ? [] : ['.private']
            }), /PAUSED: Non-auto screenshots/);
        }
        assert.throws(() => normalizeScreenshotOptions({
            directory: 'private', redaction: 'none', allowSensitiveCapture: 'true'
        }), /boolean allowSensitiveCapture/);
        assert.throws(() => normalizeScreenshotOptions({
            directory: 'private', redaction: 'unknown', allowSensitiveCapture: true
        }), /Choose auto/);
    });

    it('requires reviewed selectors for manual/AI-assisted masks and rejects ignored masks in raw mode', () => {
        for (const redaction of ['manual', 'ai-assisted']) {
            assert.throws(() => normalizeScreenshotOptions({
                directory: 'private', redaction, allowSensitiveCapture: true
            }), /reviewed maskSelectors/);
            assert.equal(normalizeScreenshotOptions({
                directory: 'private', redaction, allowSensitiveCapture: true, maskSelectors: ['.private']
            }).redaction, redaction);
        }
        assert.throws(() => normalizeScreenshotOptions({
            directory: 'private', redaction: 'none', allowSensitiveCapture: true, maskSelectors: ['.private']
        }), /cannot silently ignore/);
    });

    function redactionBody({ stale = false, missing = false } = {}) {
        function element(role) {
            return {
                attributes: {},
                setAttribute(name, value) { this.attributes[name] = value; },
                closest(selector) {
                    if (selector === 'script,style,noscript') return null;
                    if (selector.includes('gridcell')) return role === 'cell' ? this : null;
                    return role === 'heading' ? this : null;
                }
            };
        }
        const heading = element('heading');
        const cell = element('cell');
        const text = element('text');
        const input = element('input');
        const image = element('image');
        const extra = element('extra');
        const nodes = [
            { nodeValue: 'Approved heading', parentElement: heading },
            { nodeValue: 'Approved heading', parentElement: cell },
            { nodeValue: 'private-resource@example.invalid', parentElement: text }
        ];
        let index = 0;
        const body = element('body');
        body.querySelectorAll = selector => {
            if (selector === '.extra-mask') return missing ? [] : [extra];
            return [cell, input, image];
        };
        body.ownerDocument = {
            querySelector: () => stale ? heading : null,
            createTreeWalker: () => ({ nextNode: () => nodes[index++] || null })
        };
        return { body, heading, cell, text, input, image, extra };
    }

    it('masks data, inputs, media and non-contract text even when a cell matches an allowed label', () => {
        const fixture = redactionBody();
        const count = markScreenshotMasks(fixture.body, {
            marker: 'unit', allowedLabels: ['Approved heading'], maskSelectors: ['.extra-mask']
        });
        assert.equal(count, 5);
        for (const element of [fixture.cell, fixture.text, fixture.input, fixture.image, fixture.extra]) {
            assert.equal(element.attributes['data-workbook-validation-mask'], 'unit');
        }
        assert.isUndefined(fixture.heading.attributes['data-workbook-validation-mask']);
        assert.equal(fixture.heading.attributes['data-workbook-validation-label'], 'unit');
        assert.equal(fixture.body.attributes['data-workbook-validation-capture'], 'unit');
    });

    it('limits approved manual/AI-assisted masking to the selected regions', () => {
        for (const redaction of ['manual', 'ai-assisted']) {
            const fixture = redactionBody();
            const count = markScreenshotMasks(fixture.body, {
                marker: 'unit', redaction, allowedLabels: [], maskSelectors: ['.extra-mask']
            });
            assert.equal(count, 1);
            assert.equal(fixture.extra.attributes['data-workbook-validation-mask'], 'unit');
            for (const element of [fixture.cell, fixture.text, fixture.input, fixture.image]) {
                assert.deepEqual(element.attributes, {});
            }
            assert.notInclude(screenshotRedactionStyle('unit', redaction),
                'body[data-workbook-validation-capture="unit"], body[data-workbook-validation-capture="unit"] *');
        }
    });

    it('refuses stale or unmatched explicit masks before altering the page', () => {
        const stale = redactionBody({ stale: true });
        assert.throws(() => markScreenshotMasks(stale.body, {
            marker: 'unit', allowedLabels: [], maskSelectors: []
        }), /previous screenshot mask/);
        const missing = redactionBody({ missing: true });
        assert.throws(() => markScreenshotMasks(missing.body, {
            marker: 'unit', allowedLabels: [], maskSelectors: ['.extra-mask']
        }), /matched no elements/);
        assert.deepEqual(missing.body.attributes, {});
        assert.deepEqual(missing.cell.attributes, {});
    });

    function screenshotPage({ fail = false, masks = 3, blockedRedaction = false, blockedIsolation = false } = {}) {
        const calls = [];
        const cleanedRootAttributes = [];
        const body = {
            async evaluate(callback, argument) {
                if (callback === markScreenshotMasks) {
                    calls.push('mask');
                    assert.deepEqual(argument.allowedLabels, ['Approved heading']);
                    return masks;
                }
                if (callback === applyScreenshotRedaction) {
                    calls.push('redact');
                    assert.equal(argument.css, screenshotRedactionStyle(argument.marker, argument.redaction));
                    assert.include(argument.css, 'color: transparent !important');
                    assert.include(argument.css, 'background-color: #111111 !important');
                    assert.include(argument.css, 'visibility: hidden !important');
                    if (blockedRedaction) throw new Error('redaction blocked');
                    return;
                }
                calls.push('cleanup');
                callback({
                    querySelectorAll: () => [],
                    ownerDocument: { querySelectorAll: () => [] },
                    removeAttribute: name => cleanedRootAttributes.push(name)
                }, argument);
            }
        };
        const frame = {
            locator(selector) {
                assert.equal(selector, 'body');
                return body;
            }
        };
        const page = {
            locator: () => ({
                contentFrame: () => frame,
                async evaluateHandle(callback) {
                    assert.equal(callback, isolateWorkbookFrame);
                    calls.push('isolate');
                    if (blockedIsolation) throw new Error('parent isolation blocked');
                    return {
                        async evaluate() { calls.push('restore-parent'); },
                        async dispose() { calls.push('dispose-parent'); }
                    };
                }
            })
        };
        const target = {
            async screenshot(options) {
                calls.push('capture');
                assert.isUndefined(options.mask);
                assert.isUndefined(options.style);
                assert.equal(options.animations, 'disabled');
                assert.equal(options.caret, 'hide');
                assert.match(options.path, /^C:\\private-evidence\\capture-[a-z0-9-]+\.png$/);
                if (fail) throw new Error('simulated capture failure');
            }
        };
        return { page, target, calls, cleanedRootAttributes };
    }

    it('captures only with opaque masks and reports a review reminder without absolute paths', async () => {
        const fixture = screenshotPage();
        const result = await captureMaskedScreenshot(fixture.page, fixture.target,
            { directory: 'C:\\private-evidence', maskSelectors: [] }, ['Approved heading'], 0);
        assert.deepEqual(fixture.calls, ['mask', 'redact', 'isolate', 'capture', 'restore-parent', 'dispose-parent', 'cleanup']);
        assert.isTrue(result.reviewRequired);
        assert.equal(result.redaction, 'auto');
        assert.isFalse(result.publicationApproved);
        assert.equal(result.maskedElements, 3);
        assert.notInclude(JSON.stringify(result), 'private-evidence');
        assert.deepEqual(fixture.cleanedRootAttributes, [
            'data-workbook-validation-mask', 'data-workbook-validation-label', 'data-workbook-validation-capture'
        ]);
    });

    it('always cleans markers and never retries an unmasked screenshot after a capture error', async () => {
        const fixture = screenshotPage({ fail: true });
        await rejects(captureMaskedScreenshot(fixture.page, fixture.target,
            { directory: 'C:\\private-evidence', maskSelectors: [] }, ['Approved heading'], 1), /simulated capture failure/);
        assert.deepEqual(fixture.calls, ['mask', 'redact', 'isolate', 'capture', 'restore-parent', 'dispose-parent', 'cleanup']);
    });

    it('refuses mask-free captures while cleaning the temporary capture scope', async () => {
        const fixture = screenshotPage({ masks: 0 });
        await rejects(captureMaskedScreenshot(fixture.page, fixture.target,
            { directory: 'C:\\private-evidence', maskSelectors: [] }, ['Approved heading'], 2), /No screenshot masks/);
        assert.deepEqual(fixture.calls, ['mask', 'cleanup']);
    });

    it('captures unredacted content only through a distinct explicitly approved path', async () => {
        const fixture = screenshotPage();
        await rejects(captureWorkbookScreenshot(fixture.page, fixture.target,
            { directory: 'C:\\private-evidence', redaction: 'none' }, [], 0), /PAUSED/);
        assert.lengthOf(fixture.calls, 0);
        const result = await captureWorkbookScreenshot(fixture.page, fixture.target,
            { directory: 'C:\\private-evidence', redaction: 'none', allowSensitiveCapture: true }, [], 0);
        assert.deepEqual(fixture.calls, ['isolate', 'capture', 'restore-parent', 'dispose-parent']);
        assert.equal(result.redaction, 'none');
        assert.equal(result.maskedElements, 0);
        assert.isTrue(result.reviewRequired);
        assert.isFalse(result.publicationApproved);
        await rejects(captureMaskedScreenshot(fixture.page, fixture.target,
            { directory: 'private', redaction: 'none', allowSensitiveCapture: true }, [], 0), /Masked capture requires/);
    });

    it('applies selective masks for both manual and AI-assisted selection without calling an AI service', async () => {
        for (const redaction of ['manual', 'ai-assisted']) {
            const fixture = screenshotPage();
            const result = await captureWorkbookScreenshot(fixture.page, fixture.target, {
                directory: 'C:\\private-evidence', redaction, allowSensitiveCapture: true, maskSelectors: ['.private']
            }, ['Approved heading'], 0);
            assert.equal(result.redaction, redaction);
            assert.isFalse(result.publicationApproved);
            assert.deepEqual(fixture.calls, ['mask', 'redact', 'isolate', 'capture', 'restore-parent', 'dispose-parent', 'cleanup']);
        }
    });

    it('never calls the screenshot API after a failed DOM-redaction probe', async () => {
        const fixture = screenshotPage({ blockedRedaction: true });
        await rejects(captureMaskedScreenshot(fixture.page, fixture.target,
            { directory: 'C:\\private-evidence', maskSelectors: [] }, ['Approved heading'], 3), /redaction blocked/);
        assert.deepEqual(fixture.calls, ['mask', 'redact', 'cleanup']);
    });

    it('refuses capture if parent-page isolation fails and still removes workbook masks', async () => {
        const fixture = screenshotPage({ blockedIsolation: true });
        await rejects(captureMaskedScreenshot(fixture.page, fixture.target,
            { directory: 'C:\\private-evidence', maskSelectors: [] }, ['Approved heading'], 4), /parent isolation blocked/);
        assert.deepEqual(fixture.calls, ['mask', 'redact', 'isolate', 'cleanup']);
    });

    it('refuses capture if the browser blocks or ignores DOM redaction styles', () => {
        const removed = [];
        const body = {
            append() {},
            ownerDocument: {
                head: { append() {} },
                createElement: tag => ({
                    setAttribute() {},
                    remove() { removed.push(tag); }
                }),
                defaultView: { getComputedStyle: () => ({ color: 'rgb(0, 0, 0)' }) }
            }
        };
        assert.throws(() => applyScreenshotRedaction(body, { marker: 'unit', css: 'blocked' }), /did not take effect/);
        assert.deepEqual(removed, ['span']);
    });

    it('includes screenshot helpers in standalone scripts without capturing unless enabled', () => {
        const disabled = createPlaywrightScript(source, checks);
        assert.isFunction(vm.runInNewContext(`(${disabled})`));
        const enabled = createPlaywrightScript(source, {
            ...checks, screenshots: { directory: '.playwright-mcp/images' }
        });
        assert.isFunction(vm.runInNewContext(`(${enabled})`));
        assert.include(enabled, 'async function captureMaskedScreenshot');
        assert.include(enabled, 'function markScreenshotMasks');
        assert.notInclude(enabled, "require('");
    });
});

describe('Validating browser script generation...', () => {
    let directory;
    before(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workbook-browser-validator-')); });
    after(() => {
        for (const file of fs.readdirSync(directory)) {
            fs.unlinkSync(path.join(directory, file));
        }
        fs.rmdirSync(directory);
    });

    function generate(args) {
        return spawnSync(process.execPath, [path.join(__dirname, 'browser', 'generateScript.js'), ...args], {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
            env: { ...process.env, GH_TOKEN: 'browser-validator-test-sentinel' }
        });
    }

    it('generates only the requested script and does not print or embed authentication state', () => {
        const output = path.join(directory, 'smoke.js');
        const result = generate(['--workbook', fixturePath, '--checks', checksPath, '--output', output]);
        assert.equal(result.status, 0, result.stderr);
        assert.isTrue(fs.existsSync(output));
        assert.isFunction(vm.runInNewContext(`(${fs.readFileSync(output, 'utf8')})`));
        assert.notInclude(result.stdout, source);
        assert.notInclude(fs.readFileSync(output, 'utf8'), 'browser-validator-test-sentinel');
    });

    it('refuses to overwrite an existing file', () => {
        const output = path.join(directory, 'existing.js');
        fs.writeFileSync(output, 'keep this file');
        const result = generate(['--workbook', fixturePath, '--output', output]);
        assert.equal(result.status, 1);
        assert.equal(fs.readFileSync(output, 'utf8'), 'keep this file');
    });

    it('fails explicitly for missing arguments and unknown switches', () => {
        const missing = generate([]);
        assert.equal(missing.status, 1);
        assert.include(missing.stderr, '--output');
        const unknown = generate(['--credential', 'not-used']);
        assert.equal(unknown.status, 1);
        assert.include(unknown.stderr, 'Unsupported argument');
    });

    it('offers opt-in screenshot guidance and supports an explicit masked output directory', () => {
        const output = path.join(directory, 'screenshots.js');
        const result = generate(['--workbook', fixturePath, '--screenshots', 'C:\\private-evidence', '--output', output]);
        assert.equal(result.status, 0, result.stderr);
        assert.include(result.stdout, 'conservative masking');
        const without = path.join(directory, 'no-screenshots.js');
        const disabled = generate(['--workbook', fixturePath, '--output', without]);
        assert.equal(disabled.status, 0, disabled.stderr);
        assert.include(disabled.stdout, 'Would screenshots help?');
        assert.include(disabled.stdout, 'PAUSED for live execution');
    });

    it('accepts explicit per-run tenant choice and raw-capture approval without echoing the tenant', () => {
        const output = path.join(directory, 'approved-private.js');
        const result = generate(['--workbook', fixturePath, '--tenant', testTenant.id, '--confirm-tenant',
            '--screenshots', 'C:\\private-evidence', '--redaction', 'none', '--allow-sensitive-capture', '--output', output]);
        assert.equal(result.status, 0, result.stderr);
        assert.include(result.stdout, 'WARNING: approved selective/unredacted');
        assert.notInclude(result.stdout, 'PAUSED for live execution');
        assert.notInclude(result.stdout + result.stderr, testTenant.id);
        assert.isFunction(vm.runInNewContext(`(${fs.readFileSync(output, 'utf8')})`));
    });

    it('does not imply tenant confirmation or raw-capture approval from other CLI flags', () => {
        const pending = path.join(directory, 'pending-tenant.js');
        const result = generate(['--workbook', fixturePath, '--tenant', testTenant.id, '--output', pending]);
        assert.equal(result.status, 0, result.stderr);
        assert.include(result.stdout, 'PAUSED for live execution');
        const rejected = generate(['--workbook', fixturePath, '--screenshots', 'C:\\private-evidence',
            '--redaction', 'none', '--output', path.join(directory, 'rejected-raw.js')]);
        assert.equal(rejected.status, 1);
        assert.include(rejected.stderr, 'PAUSED: Non-auto screenshots');
    });

    it('can keep screenshot approval out of a private checks file and supply it only for this run', () => {
        const profile = path.join(directory, 'pending-approval.json');
        fs.writeFileSync(profile, JSON.stringify({
            screenshots: { directory: 'C:\\private-evidence', redaction: 'none' }
        }));
        const output = path.join(directory, 'per-run-approval.js');
        const result = generate(['--workbook', fixturePath, '--checks', profile,
            '--allow-sensitive-capture', '--output', output]);
        assert.equal(result.status, 0, result.stderr);
        assert.include(result.stdout, 'WARNING: approved selective/unredacted');
        assert.isUndefined(JSON.parse(fs.readFileSync(profile, 'utf8')).screenshots.allowSensitiveCapture);
    });

    it('honors negative and explicit-false CLI flags when revoking prior approvals', () => {
        const profile = path.join(directory, 'prior-approvals.json');
        fs.writeFileSync(profile, JSON.stringify({
            tenant: testTenant,
            screenshots: { directory: 'C:\\private-evidence', redaction: 'none', allowSensitiveCapture: true }
        }));
        for (const [index, flag] of ['--no-confirm-tenant', '--confirm-tenant=false'].entries()) {
            const result = generate(['--workbook', fixturePath, '--checks', profile, flag,
                '--output', path.join(directory, `revoked-tenant-${index}.js`)]);
            assert.equal(result.status, 0, result.stderr);
            assert.include(result.stdout, 'PAUSED for live execution');
        }
        for (const [index, flag] of ['--no-allow-sensitive-capture', '--allow-sensitive-capture=false'].entries()) {
            const result = generate(['--workbook', fixturePath, '--checks', profile, flag,
                '--output', path.join(directory, `revoked-capture-${index}.js`)]);
            assert.equal(result.status, 1);
            assert.include(result.stderr, 'PAUSED: Non-auto screenshots');
        }
    });

    it('generates a standalone external-browser portal step without requiring a workbook or tenant form', () => {
        const output = path.join(directory, 'open-portal.js');
        const result = generate(['--open-portal', '--output', output]);
        assert.equal(result.status, 0, result.stderr);
        assert.include(result.stdout, 'external Playwright browser');
        assert.include(result.stdout, 'pauses at sign-in/account/tenant choices');
        assert.include(result.stdout, 'not workbook-validation success');
        const script = fs.readFileSync(output, 'utf8');
        assert.isFunction(vm.runInNewContext(`(${script})`));
        assert.notInclude(script, "require('");
        assert.notInclude(script, 'setValue(');
    });

    it('offers explicit browser-session continuation without granting screenshot consent', () => {
        const output = path.join(directory, 'browser-session.js');
        const result = generate(['--workbook', fixturePath, '--use-browser-tenant', '--output', output]);
        assert.equal(result.status, 0, result.stderr);
        assert.include(result.stdout, 'Browser-session mode');
        assert.notInclude(result.stdout, 'PAUSED for live execution');
        assert.include(result.stdout, 'screenshots remain disabled');
        const rejected = generate(['--workbook', fixturePath, '--use-browser-tenant',
            '--screenshots', 'private', '--redaction', 'none', '--output', path.join(directory, 'unsafe-browser-session.js')]);
        assert.equal(rejected.status, 1);
        assert.include(rejected.stderr, 'PAUSED: Non-auto screenshots');
    });

    it('does not combine portal sign-in with workbook replacement or screenshot capture', () => {
        for (const [index, extra] of [
            ['--workbook', fixturePath], ['--checks', checksPath], ['--screenshots', 'private'],
            ['--redaction', 'none'], ['--allow-sensitive-capture']
        ].entries()) {
            const result = generate(['--open-portal', ...extra, '--output', path.join(directory, `rejected-portal-${index}.js`)]);
            assert.equal(result.status, 1);
            assert.include(result.stderr, 'separate step');
        }
    });

    it('revokes browser-session opt-in and does not override an explicit tenant constraint', () => {
        const profile = path.join(directory, 'browser-session-profile.json');
        fs.writeFileSync(profile, JSON.stringify({ tenant: { useBrowserSession: true } }));
        const revoked = generate(['--workbook', fixturePath, '--checks', profile, '--no-use-browser-tenant',
            '--output', path.join(directory, 'revoked-browser-session.js')]);
        assert.equal(revoked.status, 0, revoked.stderr);
        assert.include(revoked.stdout, 'PAUSED for live execution');
        const conflict = generate(['--workbook', fixturePath, '--use-browser-tenant', '--tenant', testTenant.id,
            '--confirm-tenant', '--output', path.join(directory, 'conflicting-tenant.js')]);
        assert.equal(conflict.status, 1);
        assert.include(conflict.stderr, 'not both');
        const pinned = path.join(directory, 'pinned-tenant.json');
        fs.writeFileSync(pinned, JSON.stringify({ tenant: testTenant }));
        const override = generate(['--workbook', fixturePath, '--checks', pinned, '--use-browser-tenant',
            '--output', path.join(directory, 'replaced-constraint.js')]);
        assert.equal(override.status, 1);
        assert.include(override.stderr, 'cannot silently replace');
    });
});
