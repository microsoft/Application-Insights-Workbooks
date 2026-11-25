const assert = require('chai').assert;
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { createValidationReport, recordValidationCheck, finishValidationReport, publicValidationReport,
    formatValidationReport, readValidationProvenance, writeValidationReport,
    validationContractSource, normalizeReviewConcerns, assessReviewConcerns } = require('./browser/workbookValidationReport');
const { createPlaywrightScript, createValidationPlan, validateWorkbookWithReport } = require('./browser/workbookBrowserValidator');

const fixture = path.join(__dirname, 'browser', 'fixtures', 'Smoke.workbook');
const source = fs.readFileSync(fixture, 'utf8');
const sourceSha256 = crypto.createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
const provenance = { sourceSha256, checksSha256: 'd'.repeat(64), validatorSha256: 'a'.repeat(64),
    workbookRevision: 'b'.repeat(40), validatorRevision: 'c'.repeat(40),
    workbookDirty: false, validatorDirty: false };
const reviewSource = 'https://github.com/example/workbooks/pull/42#pullrequestreview-123';
const reviewConcern = (overrides = {}) => ({ id: 'table-review', source: reviewSource,
    checks: [{ id: 'declared-tables', area: 'tables' }], ...overrides });

function automatedEvidence(reviewConcerns = []) {
    const report = createValidationReport(provenance, reviewConcerns);
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

    it('normalizes summary, timeline, and inline-review sources without copying review bodies', () => {
        for (const anchor of ['pullrequestreview-123', 'issuecomment-456', 'discussion_r789']) {
            const concern = reviewConcern({ source: `https://github.com/example/workbooks/pull/42#${anchor}` });
            assert.deepEqual(normalizeReviewConcerns([concern]), [{ ...concern, reviewedRevision: null }]);
        }
        assert.deepEqual(normalizeReviewConcerns(), []);
    });

    it('rejects private/free-form review fields, injected outcomes, unsafe links, and ambiguous mappings', () => {
        for (const invalid of [
            { body: 'Private review text' }, { status: 'passed' }, { source: 'http://github.com/example/workbooks/pull/42#issuecomment-1' },
            { source: reviewSource + '?token=private' }, { source: reviewSource + '\n' },
            { source: 'https://github.com@example.invalid/example/workbooks/pull/42#issuecomment-1' },
            { id: 'table-review\n' }, { reviewedRevision: 'branch-name' }, { checks: null },
            { checks: [{ id: 'declared-tables', area: 'unknown' }] },
            { checks: [{ id: 'declared-tables', area: 'tables', status: 'passed' }] },
            { checks: [{ id: 'declared-tables', area: 'tables' }, { id: 'declared-tables', area: 'tables' }] }
        ]) {
            assert.throws(() => normalizeReviewConcerns([reviewConcern(invalid)]));
        }
        assert.throws(() => normalizeReviewConcerns([reviewConcern(), reviewConcern()]), /unique generic id/);
        assert.throws(() => normalizeReviewConcerns({}), /at most 100/);
        assert.throws(() => normalizeReviewConcerns(Array.from({ length: 101 }, (_, index) =>
            reviewConcern({ id: `review-${index}` }))), /at most 100/);
    });

    it('does not drop unmapped concerns or treat absent and wrong-area checks as passes', () => {
        const checks = [{ id: 'primary-tabs', area: 'navigation', status: 'passed' }];
        const assessed = assessReviewConcerns([
            reviewConcern({ id: 'unmapped', checks: [] }),
            reviewConcern({ id: 'missing', checks: [{ id: 'filter-refresh', area: 'controls' }] }),
            reviewConcern({ id: 'rendering', checks: [{ id: 'primary-tabs', area: 'rendering' }] })
        ], checks);
        assert.deepEqual(assessed.map(concern => [concern.id, concern.status, concern.reason]), [
            ['unmapped', 'not-run', 'review-unmapped'],
            ['missing', 'not-run', 'review-check-missing'],
            ['rendering', 'not-run', 'review-check-missing']
        ]);
    });

    it('requires every mapped check to pass and retains no-data and unexecuted scenarios as findings', () => {
        const concern = reviewConcern({ checks: [
            { id: 'declared-tables', area: 'tables' }, { id: 'filter-refresh', area: 'controls' }
        ] });
        const report = automatedEvidence([concern]);
        recordValidationCheck(report, 'declared-tables', 'tables', 'passed', 'automated', { completed: 1 });
        recordValidationCheck(report, 'filter-refresh', 'controls', 'not-run', 'none', {}, 'no-data');
        finishValidationReport(report, 'passed');
        assert.deepEqual(report.reviewAssessments, [{ id: concern.id, status: 'not-run', reason: 'review-check-not-run' }]);
        assert.includeDeepMembers(report.findings,
            [{ id: concern.id, area: 'review-concern', status: 'not-run', reason: 'review-check-not-run' }]);
        assert.include(formatValidationReport(report), 'Required records were unavailable');
        recordValidationCheck(report, 'filter-refresh', 'controls', 'passed', 'scenario', { assertions: 2 });
        finishValidationReport(report, 'passed');
        assert.equal(report.reviewAssessments[0].status, 'passed');
        assert.isFalse(report.findings.some(finding => finding.area === 'review-concern'));
        assert.equal(report.reviewStatus, 'requires-authorized-reviewer');
    });

    it('propagates blockers and failures even when other required scenario checks are still missing', () => {
        for (const status of ['blocked', 'failed']) {
            const report = createValidationReport(provenance, [reviewConcern({ checks: [
                { id: 'authenticated-session', area: 'authentication' }, { id: 'filter-refresh', area: 'controls' }
            ] })]);
            recordValidationCheck(report, 'authenticated-session', 'authentication', status, 'automated', {},
                status === 'blocked' ? 'account-selection' : 'automation-error');
            finishValidationReport(report, status);
            assert.equal(report.reviewAssessments[0].status, status);
            assert.equal(report.reviewAssessments[0].reason, `review-check-${status}`);
            assert.equal(report.findings.find(finding => finding.area === 'review-concern').status, status);
        }
    });

    it('recomputes concern assessments when checks change rather than trusting a previous passed label', () => {
        const report = automatedEvidence([reviewConcern()]);
        recordValidationCheck(report, 'declared-tables', 'tables', 'passed', 'automated', { completed: 1 });
        finishValidationReport(report, 'passed');
        assert.equal(report.reviewAssessments[0].status, 'passed');
        recordValidationCheck(report, 'declared-tables', 'tables', 'failed', 'automated', {}, 'automation-error');
        finishValidationReport(report, 'failed');
        assert.equal(report.reviewAssessments[0].status, 'failed');
    });

    it('binds the reviewed revision and each concern-to-check mapping into the checks digest', () => {
        const contracts = reviewConcerns => validationContractSource(createValidationPlan(source, { reviewConcerns }));
        const expected = contracts([reviewConcern()]);
        assert.notEqual(expected, contracts([reviewConcern({ reviewedRevision: 'a'.repeat(40) })]));
        assert.notEqual(expected, contracts([reviewConcern({ checks: [{ id: 'filter-refresh', area: 'controls' }] })]));
        assert.equal(validationContractSource(createValidationPlan(source)),
            validationContractSource(createValidationPlan(source, { reviewConcerns: [] })));
    });

    it('formats concern sources, older reviewed revisions, required checks, and remaining investigation', () => {
        const report = finishValidationReport(automatedEvidence([
            reviewConcern({ reviewedRevision: 'a'.repeat(40) }), reviewConcern({ id: 'needs-investigation', checks: [] })
        ]), 'passed');
        const markdown = formatValidationReport(report);
        assert.include(markdown, 'Reviewer concerns: Needs a closer look');
        assert.include(markdown, `[table-review](${reviewSource})`);
        assert.include(markdown, '`' + 'a'.repeat(40) + '`');
        assert.include(markdown, 'declared-tables (tables)');
        assert.include(markdown, 'investigate the source and add assertions');
        assert.equal(report.status, 'partial');
    });

    it('round-trips assessed reports and rejects false assessments or deleted concern findings', () => {
        const report = finishValidationReport(automatedEvidence([reviewConcern()]), 'passed');
        assert.deepEqual(publicValidationReport(JSON.parse(JSON.stringify(report))), report);
        const falseAssessment = { ...report, reviewAssessments: [{ id: 'table-review', status: 'passed', reason: null }] };
        assert.throws(() => publicValidationReport(falseAssessment), /assessments do not match/);
        assert.throws(() => publicValidationReport({ ...report,
            findings: report.findings.filter(finding => finding.area !== 'review-concern') }), /findings\/status do not match/);
    });

    it('keeps older reports without concern fields readable without inventing a review assessment', () => {
        const report = finishValidationReport(automatedEvidence(), 'passed');
        delete report.reviewConcerns;
        delete report.reviewAssessments;
        const safe = publicValidationReport(report);
        assert.deepEqual(safe.reviewConcerns, []);
        assert.deepEqual(safe.reviewAssessments, []);
    });

    it('requires report-enabled runners instead of silently dropping requested review concerns', () => {
        assert.throws(() => createPlaywrightScript(source, { reviewConcerns: [reviewConcern()] }), /require --report/);
    });

    it('returns concern findings from a portable paused run without browser access or false scenario passes', async () => {
        const script = createPlaywrightScript(source, { reviewConcerns: [reviewConcern({ checks: [
            { id: 'authenticated-session', area: 'authentication' }, { id: 'scenario-controls', area: 'controls' }
        ] })] }, provenance);
        const run = vm.runInNewContext(`(${script})`);
        const report = await run({ url() { throw new Error('Unexpected browser access'); } });
        assert.equal(report.automationStatus, 'blocked');
        assert.equal(report.reviewAssessments[0].status, 'blocked');
        assert.doesNotThrow(() => publicValidationReport(report));
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
    }).timeout(15000);

    it('binds changed contract thresholds without hashing tenant or screenshot paths', () => {
        const options = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser', 'fixtures', 'smoke-checks.json'), 'utf8'));
        const context = settings => validationContractSource(createValidationPlan(source, settings));
        const expected = context(options);
        assert.notEqual(context({ ...options, deferred: options.deferred.map(check => ({ ...check, maxRows: 10 })) }), expected);
        assert.equal(context({ ...options, tenant: { useBrowserSession: true },
            screenshots: { directory: directory } }), expected);
    });

    it('handles clean long/space-containing Git paths and distinguishes ignored snapshots from committed source', () => {
        const repository = path.resolve(directory, 'source-repository');
        fs.mkdirSync(repository);
        const git = args => {
            const result = spawnSync('git', ['--no-pager', '-c', 'core.longpaths=true',
                '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${path.join(repository, 'no-hooks')}`,
                '-C', repository, ...args], { encoding: 'utf8', timeout: 15000 });
            assert.equal(result.status, 0, result.stderr);
        };
        try {
            git(['init', '--template=']);
            const folder = path.join(repository, 'workbook path with spaces ' + 'x'.repeat(35));
            fs.mkdirSync(folder);
            const file = path.join(folder, 'Long' + 'f'.repeat(180) + '.workbook');
            assert.isAbove(file.length, 260);
            assert.isAbove(path.posix.join('/tmp/workbook-report-XXXXXX', 'source-repository',
                path.basename(folder), path.basename(file)).length, 260);
            fs.writeFileSync(file, source);
            git(['add', '--', file]);
            git(['-c', 'user.name=Workbook Validator Test', '-c', 'user.email=workbook-validator@example.invalid',
                'commit', '-m', 'Create synthetic workbook fixture',
                '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>']);
            const context = readValidationProvenance(file, source, createValidationPlan(source));
            assert.isFalse(context.workbookDirty);
            assert.equal(context.sourceSha256, sourceSha256);
            fs.writeFileSync(path.join(repository, '.gitignore'), 'ignored.workbook\n');
            const ignored = path.join(repository, 'ignored.workbook');
            fs.writeFileSync(ignored, source);
            assert.isTrue(readValidationProvenance(ignored, source).workbookDirty);
        } finally {
            fs.rmSync(repository, { recursive: true });
        }
    }).timeout(15000);

    it('retains content hashes and explicitly warns when Git is not installed', () => {
        const env = { ...process.env };
        for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
        env.PATH = directory;
        const script = `
            const fs = require('fs');
            const { readValidationProvenance } = require(${JSON.stringify(require.resolve('./browser/workbookValidationReport'))});
            const { createValidationPlan } = require(${JSON.stringify(require.resolve('./browser/workbookBrowserValidator'))});
            const file = ${JSON.stringify(fixture)};
            const source = fs.readFileSync(file, 'utf8');
            console.log(JSON.stringify(readValidationProvenance(file, source, createValidationPlan(source))));
        `;
        const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env, timeout: 15000 });
        assert.equal(result.status, 0, result.stderr);
        assert.include(result.stderr, 'Git is unavailable; retaining content hashes');
        const context = JSON.parse(result.stdout);
        assert.equal(context.sourceSha256, sourceSha256);
        assert.match(context.checksSha256, /^[a-f0-9]{64}$/);
        assert.match(context.validatorSha256, /^[a-f0-9]{64}$/);
        for (const field of ['workbookRevision', 'validatorRevision', 'workbookDirty', 'validatorDirty']) {
            assert.isNull(context[field]);
        }
    });

    it('does not hide Git execution errors other than an unavailable executable', () => {
        const script = `
            require('child_process').spawnSync = () => ({
                error: Object.assign(new Error('Synthetic Git access failure'), { code: 'EACCES' })
            });
            const { readValidationProvenance } = require(${JSON.stringify(require.resolve('./browser/workbookValidationReport'))});
            require('node:assert/strict').throws(() => readValidationProvenance(${JSON.stringify(fixture)},
                ${JSON.stringify(source)}), { code: 'EACCES' });
        `;
        const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 15000 });
        assert.equal(result.status, 0, result.stderr);
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

    it('retains explicit invalid-options failures without touching the browser', async () => {
        const report = await validateWorkbookWithReport({ url() { throw new Error('Unexpected browser access'); } },
            source, null);
        assert.equal(report.automationStatus, 'failed');
        assert.equal(report.checks.find(check => check.id === 'exact-source').status, 'failed');
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
        const checks = path.join(directory, 'review-checks.json');
        fs.writeFileSync(checks, JSON.stringify({ reviewConcerns: [reviewConcern({ checks: [
            { id: 'authenticated-session', area: 'authentication' }, { id: 'scenario-controls', area: 'controls' }
        ] })] }));
        const env = { ...process.env, WORKBOOK_BROWSER_TEMPLATE: fixture,
            WORKBOOK_BROWSER_CDP_ENDPOINT: 'http://127.0.0.1:1', WORKBOOK_BROWSER_REPORT: prefix,
            WORKBOOK_BROWSER_CHECKS: checks };
        for (const name of ['TENANT_ID', 'TENANT_CONFIRMED', 'USE_BROWSER_TENANT',
            'SCREENSHOTS', 'REDACTION', 'ALLOW_SENSITIVE_CAPTURE']) delete env[`WORKBOOK_BROWSER_${name}`];
        const result = spawnSync(process.execPath, [require.resolve('mocha/bin/mocha.js'),
            '--timeout', '10000', path.join(__dirname, 'browser', 'workbookValidation.test.js')],
        { encoding: 'utf8', env, timeout: 15000 });
        assert.equal(result.status, 1, result.stderr);
        assert.notInclude(result.stdout + result.stderr, 'ECONNREFUSED');
        const report = JSON.parse(fs.readFileSync(`${prefix}.json`, 'utf8'));
        assert.equal(report.automationStatus, 'blocked');
        assert.equal(report.checks.find(check => check.id === 'exact-source').status, 'not-run');
        assert.equal(report.reviewAssessments[0].status, 'blocked');
        assert.isTrue(report.findings.some(finding => finding.area === 'review-concern'));
    });
});
