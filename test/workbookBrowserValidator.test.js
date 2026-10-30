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
    createValidationPlan,
    validateWorkbookInBrowser,
    loadValidationInput,
    validateCdpEndpoint,
    createPlaywrightScript
} = require('./browser/workbookBrowserValidator');

const fixturePath = path.join(__dirname, 'browser', 'fixtures', 'Smoke.workbook');
const checksPath = path.join(__dirname, 'browser', 'fixtures', 'smoke-checks.json');
const source = fs.readFileSync(fixturePath, 'utf8');
const checks = JSON.parse(fs.readFileSync(checksPath, 'utf8'));
const emptySource = JSON.stringify({ version: 'Notebook/1.0', items: [] });

function changedSource(change) {
    const workbook = JSON.parse(source);
    change(workbook);
    return JSON.stringify(workbook);
}

function editorPage(existingSource, editorCount = 1, unsaved = true) {
    const state = { value: existingSource, writes: 0, clicks: [], backgroundModelAccess: 0 };
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
            return {
                async waitFor() {},
                async click() { state.clicks.push(options.name); },
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
        getByRole: () => ({ count: async () => unsaved ? 1 : 0 }),
        locator: () => ({ contentFrame: () => frame })
    };
    return { page, state };
}

describe('Validating browser validator contracts...', () => {
    it('uses a schema-valid fixture containing only inline JSON, text, and parameter actions', () => {
        const workbook = JSON.parse(source);
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'workbook.json'), 'utf8'));
        const result = new Validator().validate(workbook, schema);
        assert.isTrue(result.valid, result.errors.map(error => error.stack).join('\n'));
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
        assert.equal(plan.itemCount, 7);
        assert.equal(plan.deferred[0].tab, 'Overview');
        assert.equal(plan.deferred[0].minRows, 2);
        assert.equal(plan.deferred[0].maxRows, 2);
        assert.deepEqual(plan.deferred[0].columns, ['Label', 'Count']);
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
        assert.equal(createValidationPlan(localGroup, checks).deferred.length, 1);
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
        assert.equal(createValidationPlan(JSON.stringify(exported), checks).deferred.length, 1);
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
        assert.include(report.coverage, 'no-data is not proof of health');
        assert.isFalse(report.workbookSaved);
        assert.notInclude(JSON.stringify(report), emptySource);
    });

    it('emits a self-contained Playwright function without Node imports or credentials', async () => {
        const script = createPlaywrightScript(source, checks);
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
        const run = vm.runInContext(`(${createPlaywrightScript(injected, checks)})`, context);
        await rejects(run({ url: () => 'https://login.microsoftonline.com/' }), /Sign in to Azure/);
        assert.isUndefined(context.injected);
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
});
