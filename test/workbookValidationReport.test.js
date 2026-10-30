const assert = require('chai').assert;
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { createValidationReport, recordValidationCheck, finishValidationReport, publicValidationReport,
    formatValidationReport, readValidationProvenance, writeValidationReport,
    validationContractSource } = require('./browser/workbookValidationReport');
const { createPlaywrightScript, createValidationPlan, validateWorkbookWithReport } = require('./browser/workbookBrowserValidator');

const fixture = path.join(__dirname, 'browser', 'fixtures', 'Smoke.workbook');
const source = fs.readFileSync(fixture, 'utf8');
const sourceSha256 = crypto.createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
const provenance = { sourceSha256, checksSha256: 'd'.repeat(64), validatorSha256: 'a'.repeat(64),
    workbookRevision: 'b'.repeat(40), validatorRevision: 'c'.repeat(40),
    workbookDirty: false, validatorDirty: false };

function automatedEvidence() {
    const report = createValidationReport(provenance);
    for (const [id, area] of [['browser-session', 'browser'],
        ['authenticated-session', 'authentication'], ['exact-source', 'source']]) {
        recordValidationCheck(report, id, area, 'passed', 'automated', { assertions: 1 });
    }
    return report;
}

describe('Reporting workbook validation evidence...', () => {
    let directory;

    beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workbook-report-')); });
    afterEach(() => {
        for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
        fs.rmdirSync(directory);
    });

    it('starts every coverage area as not-run, without assuming rendering or drill-down success', () => {
        const report = createValidationReport(provenance);
        assert.isTrue(report.checks.every(check => check.status === 'not-run'));
        assert.includeMembers(report.checks.map(check => check.area), ['rendering', 'controls', 'drilldowns', 'visual-review']);
        assert.equal(report.reviewStatus, 'requires-authorized-reviewer');
        assert.throws(() => finishValidationReport(report, 'passed'), /requires browser, authentication/);
    });

    it('keeps automated success distinct from unverified scenarios and manual approval', () => {
        const report = finishValidationReport(automatedEvidence(), 'passed');
        assert.equal(report.automationStatus, 'passed');
        assert.equal(report.status, 'partial');
        assert.isTrue(report.findings.some(finding => finding.id === 'scenario-controls'));
        const markdown = formatValidationReport(report);
        assert.include(markdown, 'Requires executed scenario-specific assertions');
    });

    it('only replaces a scenario placeholder with actually recorded checks', () => {
        const report = automatedEvidence();
        recordValidationCheck(report, 'filter-refresh', 'controls', 'passed', 'scenario', { assertions: 2 });
        recordValidationCheck(report, 'row-context', 'controls', 'not-run', 'none', {}, 'no-data');
        finishValidationReport(report, 'passed');
        assert.notInclude(report.checks.map(check => check.id), 'scenario-controls');
        assert.equal(report.checks.find(check => check.id === 'row-context').status, 'not-run');
        assert.include(formatValidationReport(report), 'Required records were unavailable');
        assert.equal(report.reviewStatus, 'requires-authorized-reviewer');
    });

    it('requires actual assertion counts for passed supplementary checks', () => {
        for (const method of ['scenario', 'manual']) {
            assert.throws(() => recordValidationCheck(automatedEvidence(), 'example', 'controls',
                'passed', method), /executed assertions/);
        }
    });

    it('refuses success-shaped blocked/failed automation and scenario results', () => {
        for (const method of ['automated', 'scenario']) {
            for (const status of ['blocked', 'failed']) {
                const report = automatedEvidence();
                recordValidationCheck(report, 'filter-refresh', 'controls', status, method, {}, 'automation-error');
                assert.throws(() => finishValidationReport(report, 'passed'), /cannot be reported as passed/);
            }
        }
    });

    it('rejects private context, raw record values, free-form diagnostics, and invalid provenance types', () => {
        assert.throws(() => createValidationReport({ ...provenance, tenantId: 'private' }), /only source/);
        assert.throws(() => createValidationReport({ ...provenance, sourceSha256: [sourceSha256] }), /Invalid report provenance/);
        const report = automatedEvidence();
        assert.throws(() => recordValidationCheck(report, 'private', 'controls', 'passed', 'scenario',
            { account: 'private' }), /only approved aggregate counts/);
        assert.throws(() => recordValidationCheck(report, 'private', 'controls', 'blocked', 'scenario',
            {}, 'private error message'), /Invalid validation check/);
        finishValidationReport(report, 'passed');
        report.tenantId = 'private';
        assert.throws(() => formatValidationReport(report), /Invalid public validation report/);
    });

    it('round-trips completed reports and refuses deleted gaps, false findings, or changed statuses', () => {
        const report = finishValidationReport(automatedEvidence(), 'passed');
        assert.deepEqual(publicValidationReport(JSON.parse(JSON.stringify(report))), report);
        assert.throws(() => publicValidationReport({ ...report, status: 'passed' }), /do not match/);
        assert.throws(() => publicValidationReport({ ...report, findings: [] }), /do not match/);
        const omitted = { ...report, checks: report.checks.filter(check => check.area !== 'drilldowns') };
        assert.throws(() => publicValidationReport(omitted), /retain every coverage area/);
    });

    it('rejects evidence timestamps from another run window', () => {
        const report = finishValidationReport(automatedEvidence(), 'passed');
        report.checks[0].completedAt = '2000-01-01T00:00:00.000Z';
        assert.throws(() => publicValidationReport(report), /Invalid public validation check/);
    });

    it('writes reviewable JSON and Markdown without overwriting existing evidence', () => {
        const report = finishValidationReport(automatedEvidence(), 'passed');
        const prefix = path.join(directory, 'evidence');
        const files = writeValidationReport(report, prefix);
        assert.deepEqual(JSON.parse(fs.readFileSync(files.json, 'utf8')), report);
        assert.include(fs.readFileSync(files.markdown, 'utf8'), 'does not sign in the reviewer');
        assert.throws(() => writeValidationReport(report, prefix), /already exists/);
        for (const invalid of ['https://example.invalid/report', '\\\\server\\share', 'report\nprivate']) {
            assert.throws(() => writeValidationReport(report, invalid), /private local/);
        }
    });

    it('records source and implementation digests without exporting paths or identity', () => {
        const context = readValidationProvenance(fixture, source, createValidationPlan(source));
        assert.equal(context.sourceSha256, sourceSha256);
        assert.match(context.validatorSha256, /^[a-f0-9]{64}$/);
        assert.match(context.checksSha256, /^[a-f0-9]{64}$/);
        assert.equal(context.checksSha256, crypto.createHash('sha256')
            .update(validationContractSource(createValidationPlan(source))).digest('hex'));
        assert.match(context.validatorRevision, /^[a-f0-9]{40}$/);
        assert.isBoolean(context.validatorDirty);
        assert.notInclude(JSON.stringify(context), fixture);
        assert.isTrue(readValidationProvenance(fixture, source + ' ').workbookDirty);
    });

    it('binds changed contract thresholds without hashing tenant or screenshot paths', () => {
        const options = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser', 'fixtures', 'smoke-checks.json'), 'utf8'));
        const context = settings => validationContractSource(createValidationPlan(source, settings));
        const expected = context(options);
        assert.notEqual(context({ ...options, deferred: options.deferred.map(check => ({ ...check, maxRows: 10 })) }), expected);
        assert.equal(context({ ...options, tenant: { useBrowserSession: true },
            screenshots: { directory: directory } }), expected);
    });

    it('emits portable reports that pause before browser access when tenant consent is absent', async () => {
        const script = createPlaywrightScript(source, {}, provenance);
        const run = vm.runInNewContext(`(${script})`);
        const report = await run({ url() { throw new Error('Unexpected browser access'); } });
        assert.equal(report.automationStatus, 'blocked');
        assert.equal(report.status, 'blocked');
        assert.equal(report.checks.find(check => check.id === 'exact-source').status, 'not-run');
        assert.doesNotThrow(() => publicValidationReport(report));
    });

    it('preserves local diagnostic errors separately from the safe report', async () => {
        const sentinel = 'SYNTHETIC PRIVATE ERROR';
        let observed;
        const report = await validateWorkbookWithReport({ url() { throw new Error(sentinel); } }, source,
            { tenant: { useBrowserSession: true } }, provenance, error => { observed = error; });
        assert.equal(observed.message, sentinel);
        assert.equal(report.automationStatus, 'failed');
        assert.notInclude(JSON.stringify(report), sentinel);
        assert.notInclude(formatValidationReport(report), sentinel);
    });

    it('does not turn a non-Error rejection into success', async () => {
        const report = await validateWorkbookWithReport({ url() { throw null; } }, source,
            { tenant: { useBrowserSession: true } }, provenance);
        assert.equal(report.automationStatus, 'failed');
    });

    it('formats a blocked report but retains a nonzero process outcome', () => {
        const report = createValidationReport(provenance);
        recordValidationCheck(report, 'authenticated-session', 'authentication', 'blocked',
            'automated', {}, 'account-selection');
        finishValidationReport(report, 'blocked');
        const input = path.join(directory, 'input.json');
        fs.writeFileSync(input, JSON.stringify(report));
        const output = path.join(directory, 'blocked');
        const result = spawnSync(process.execPath, [path.join(__dirname, 'browser', 'report.js'),
            '--input', input, '--output', output], { encoding: 'utf8' });
        assert.equal(result.status, 1, result.stderr);
        assert.include(fs.readFileSync(`${output}.md`, 'utf8'), 'Paused for the user to select an account');
    });

    it('fails the formatter process for failed manual review despite passed automation', () => {
        const report = automatedEvidence();
        recordValidationCheck(report, 'manual-visual-review', 'visual-review', 'failed',
            'manual', { assertions: 1 }, 'automation-error');
        finishValidationReport(report, 'passed');
        const input = path.join(directory, 'input.json');
        fs.writeFileSync(input, JSON.stringify(report));
        const result = spawnSync(process.execPath, [path.join(__dirname, 'browser', 'report.js'),
            '--input', input, '--output', path.join(directory, 'failed')], { encoding: 'utf8' });
        assert.equal(result.status, 1, result.stderr);
    });

    it('supports CLI generation with immutable provenance and explicit report semantics', () => {
        const output = path.join(directory, 'runner.js');
        const result = spawnSync(process.execPath, [path.join(__dirname, 'browser', 'generateScript.js'),
            '--workbook', fixture, '--report', '--output', output], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.include(fs.readFileSync(output, 'utf8'), sourceSha256);
        assert.include(result.stdout, 'Inspect automationStatus');
    });

    it('persists a blocked Mocha setup report while keeping the test red and avoiding CDP', () => {
        const prefix = path.join(directory, 'setup');
        const env = { ...process.env, WORKBOOK_BROWSER_TEMPLATE: fixture,
            WORKBOOK_BROWSER_CDP_ENDPOINT: 'http://127.0.0.1:1', WORKBOOK_BROWSER_REPORT: prefix };
        for (const name of ['TENANT_ID', 'TENANT_CONFIRMED', 'USE_BROWSER_TENANT', 'CHECKS',
            'SCREENSHOTS', 'REDACTION', 'ALLOW_SENSITIVE_CAPTURE']) delete env[`WORKBOOK_BROWSER_${name}`];
        const result = spawnSync(process.execPath, [require.resolve('mocha/bin/mocha.js'),
            '--timeout', '10000', path.join(__dirname, 'browser', 'workbookValidation.test.js')],
        { encoding: 'utf8', env, timeout: 15000 });
        assert.equal(result.status, 1, result.stderr);
        assert.notInclude(result.stdout + result.stderr, 'ECONNREFUSED');
        const report = JSON.parse(fs.readFileSync(`${prefix}.json`, 'utf8'));
        assert.equal(report.automationStatus, 'blocked');
        assert.equal(report.checks.find(check => check.id === 'exact-source').status, 'not-run');
    });
});
