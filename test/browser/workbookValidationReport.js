const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function validationContractSource(plan) {
    return JSON.stringify({ tabs: plan.tabs, deferred: plan.deferred, timeout: plan.timeout });
}

function createValidationReport(provenance = {}) {
    const fields = ['sourceSha256', 'checksSha256', 'validatorSha256', 'workbookRevision', 'validatorRevision',
        'workbookDirty', 'validatorDirty'];
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance) ||
        Object.keys(provenance).some(key => !fields.includes(key))) {
        throw new Error('Report provenance must contain only source/validator hashes, revisions, and dirty flags.');
    }
    const safe = {};
    for (const field of fields) {
        const value = provenance[field] ?? null;
        const valid = field.endsWith('Dirty') ? typeof value === 'boolean' :
            typeof value === 'string' && new RegExp(`^[a-f0-9]{${field.endsWith('Sha256') ? 64 : 40}}$`).test(value);
        if (value !== null && !valid) throw new Error(`Invalid report provenance: ${field}.`);
        safe[field] = value;
    }
    const checks = [
        ['browser-session', 'browser', 'unreached'],
        ['authenticated-session', 'authentication', 'unreached'],
        ['exact-source', 'source', 'unreached'],
        ['primary-tabs', 'navigation', 'unreached'],
        ['declared-tables', 'tables', 'unreached'],
        ['deferred-actions', 'deferred', 'unreached'],
        ['scenario-rendering', 'rendering', 'scenario-not-run'],
        ['scenario-controls', 'controls', 'scenario-not-run'],
        ['scenario-drilldowns', 'drilldowns', 'scenario-not-run'],
        ['screenshot-capture', 'screenshots', 'not-requested'],
        ['manual-visual-review', 'visual-review', 'human-review-required']
    ].map(([id, area, reason]) => ({
        id, area, status: 'not-run', method: 'none', reason, evidence: {}, completedAt: null
    }));
    return {
        schemaVersion: 1,
        runId: `workbook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        startedAt: new Date().toISOString(),
        completedAt: null,
        provenance: safe,
        automationStatus: 'not-run',
        status: 'partial',
        reviewStatus: 'requires-authorized-reviewer',
        screenshotRedaction: 'not-run',
        checks,
        findings: []
    };
}

function recordValidationCheck(report, id, area, status, method, evidence = {}, reason = null) {
    const areas = ['browser', 'authentication', 'source', 'navigation', 'tables', 'deferred',
        'rendering', 'controls', 'drilldowns', 'screenshots', 'visual-review'];
    const reasons = ['unreached', 'not-requested', 'not-configured', 'scenario-not-run',
        'human-review-required', 'account-selection', 'tenant-selection', 'sign-in',
        'authorization-required', 'browser-unavailable', 'editor-not-ready', 'no-data',
        'not-applicable', 'automation-error', 'source-mismatch', 'checks-mismatch'];
    const counts = ['expected', 'completed', 'rows', 'rowsAudited', 'actions', 'captures', 'assertions'];
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id) || !areas.includes(area) ||
        !['passed', 'blocked', 'failed', 'not-run'].includes(status) ||
        !['automated', 'scenario', 'manual', 'none'].includes(method) ||
        (status === 'not-run') !== (method === 'none') ||
        (status === 'passed' ? reason !== null : !reasons.includes(reason))) {
        throw new Error('Invalid validation check identity, status, method, or reason.');
    }
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) ||
        Object.entries(evidence).some(([key, value]) => !counts.includes(key) ||
            !Number.isSafeInteger(value) || value < 0)) {
        throw new Error('Report evidence accepts only approved aggregate counts; never record values or error messages.');
    }
    if (status === 'passed' && ['scenario', 'manual'].includes(method) && !(evidence.assertions > 0)) {
        throw new Error('A passed supplementary check requires executed assertions.');
    }
    const existing = report.checks.find(check => check.id === id);
    if (existing && existing.area !== area) throw new Error('A check cannot change its coverage area.');
    if (id !== `scenario-${area}`) {
        report.checks = report.checks.filter(check => check.id !== `scenario-${area}` ||
            check.reason !== 'scenario-not-run');
    }
    const check = { id, area, status, method, reason, evidence: { ...evidence },
        completedAt: status === 'not-run' ? null : new Date().toISOString() };
    const index = report.checks.findIndex(value => value.id === id);
    if (index === -1) report.checks.push(check);
    else report.checks[index] = check;
    return report;
}

function finishValidationReport(report, automationStatus) {
    if (!['passed', 'blocked', 'failed'].includes(automationStatus)) {
        throw new Error('A completed report needs an explicit automated outcome.');
    }
    if (automationStatus === 'passed' && report.checks.some(check =>
        ['automated', 'scenario'].includes(check.method) && ['blocked', 'failed'].includes(check.status))) {
        throw new Error('Blocked or failed automation cannot be reported as passed.');
    }
    if (automationStatus === 'passed' && (!report.provenance.sourceSha256 || !report.provenance.checksSha256 ||
        ['browser-session', 'authenticated-session', 'exact-source'].some(id =>
            !report.checks.some(check => check.id === id && check.status === 'passed')))) {
        throw new Error('Passing automation requires browser, authentication, and exact-source evidence.');
    }
    report.automationStatus = automationStatus;
    report.completedAt = new Date().toISOString();
    report.findings = report.checks.filter(check => check.status !== 'passed')
        .map(({ id, area, status, reason }) => ({ id, area, status, reason }));
    report.status = automationStatus === 'failed' || report.checks.some(check => check.status === 'failed') ? 'failed' :
        automationStatus === 'blocked' || report.checks.some(check => check.status === 'blocked') ? 'blocked' :
            report.findings.length ? 'partial' : 'passed';
    return report;
}

function publicValidationReport(report) {
    const fields = ['schemaVersion', 'runId', 'startedAt', 'completedAt', 'provenance',
        'automationStatus', 'status', 'reviewStatus', 'screenshotRedaction', 'checks', 'findings'];
    const timestamp = value => typeof value === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
    if (!report || Object.keys(report).some(key => !fields.includes(key)) || report.schemaVersion !== 1 ||
        !/^workbook-[a-z0-9-]+$/.test(report.runId) || !timestamp(report.startedAt) ||
        !timestamp(report.completedAt) || report.reviewStatus !== 'requires-authorized-reviewer' ||
        !['not-run', 'not-requested', 'auto', 'manual', 'ai-assisted', 'none'].includes(report.screenshotRedaction) ||
        report.completedAt < report.startedAt || !Array.isArray(report.checks) || !report.checks.length) {
        throw new Error('Invalid public validation report; do not attach raw browser output or private diagnostics.');
    }
    const safe = createValidationReport(report.provenance);
    const requiredAreas = safe.checks.map(check => check.area);
    safe.checks = [];
    for (const check of report.checks) {
        if (!check || Object.keys(check).some(key =>
            !['id', 'area', 'status', 'method', 'reason', 'evidence', 'completedAt'].includes(key)) ||
            safe.checks.some(value => value.id === check.id) ||
            (check.status === 'not-run' ? check.completedAt !== null : !timestamp(check.completedAt) ||
                check.completedAt < report.startedAt || check.completedAt > report.completedAt)) {
            throw new Error('Invalid public validation check.');
        }
        recordValidationCheck(safe, check.id, check.area, check.status, check.method, check.evidence, check.reason);
        safe.checks[safe.checks.length - 1].completedAt = check.completedAt;
    }
    if (requiredAreas.some(area => !safe.checks.some(check => check.area === area))) {
        throw new Error('A public report must retain every coverage area, including unexecuted checks.');
    }
    finishValidationReport(safe, report.automationStatus);
    if (safe.status !== report.status || !Array.isArray(report.findings) ||
        safe.findings.length !== report.findings.length || safe.findings.some((finding, index) => {
            const supplied = report.findings[index];
            return !supplied || Object.keys(supplied).some(key => !['id', 'area', 'status', 'reason'].includes(key)) ||
                Object.keys(finding).some(key => supplied[key] !== finding[key]);
        })) {
        throw new Error('Report findings/status do not match its executed checks.');
    }
    return { ...safe, runId: report.runId, startedAt: report.startedAt, completedAt: report.completedAt,
        screenshotRedaction: report.screenshotRedaction };
}

function formatValidationReport(report) {
    const safe = publicValidationReport(report);
    const reasons = {
        unreached: 'Not reached in this run.',
        'not-requested': 'Not requested; no capture or approval is implied.',
        'not-configured': 'No contract configured for this area.',
        'scenario-not-run': 'Requires executed scenario-specific assertions.',
        'human-review-required': 'Requires manual visual review; automation is not reviewer approval.',
        'account-selection': 'Paused for the user to select an account in the external browser.',
        'tenant-selection': 'Paused for the user to select a tenant in the external browser.',
        'sign-in': 'Paused for user sign-in in the external browser.',
        'authorization-required': 'Sign-in, tenant selection, or fresh authorization could not be verified.',
        'browser-unavailable': 'The dedicated browser connection could not be established.',
        'editor-not-ready': 'A unique new empty unsaved workbook editor is required.',
        'no-data': 'Required records were unavailable; the scenario was not validated.',
        'not-applicable': 'Explicitly excluded; not evidence of execution.',
        'automation-error': 'An assertion/operation failed; inspect private local diagnostics.',
        'source-mismatch': 'Requested source does not match the recorded source hash; import was refused.',
        'checks-mismatch': 'Requested contracts do not match the recorded checks hash; import was refused.'
    };
    const provenance = safe.provenance;
    const lines = [
        '# Workbook validation report',
        '',
        `- Run: \`${safe.runId}\``,
        `- Started: ${safe.startedAt}; completed: ${safe.completedAt}`,
        `- Automated checks: **${safe.automationStatus}**; coverage: **${safe.status}**`,
        `- Workbook revision: \`${provenance.workbookRevision || 'unrecorded'}\`; modified: ${provenance.workbookDirty ?? 'unknown'}`,
        `- Source SHA-256: \`${provenance.sourceSha256 || 'unrecorded'}\``,
        `- Checks SHA-256: \`${provenance.checksSha256 || 'unrecorded'}\` (tabs, deferred contracts, and timeout; no tenant or capture paths)`,
        `- Validator revision: \`${provenance.validatorRevision || 'unrecorded'}\`; modified: ${provenance.validatorDirty ?? 'unknown'}`,
        `- Validator implementation SHA-256: \`${provenance.validatorSha256 || 'unrecorded'}\``,
        `- Screenshot redaction: **${safe.screenshotRedaction}**; any images still require manual review and separate publication approval.`,
        '',
        '| Check | Area | Status | Method | Evidence / remaining work |',
        '|---|---|---|---|---|'
    ];
    for (const check of safe.checks) {
        const counts = Object.entries(check.evidence).map(([key, value]) => `${key}: ${value}`).join('; ');
        lines.push(`| ${check.id} | ${check.area} | ${check.status} | ${check.method} | ${counts}${counts && check.reason ? '; ' : ''}${check.reason ? reasons[check.reason] : ''} |`);
    }
    lines.push('', '## Findings and handoff', '');
    lines.push(...(safe.findings.length ? safe.findings.map(finding =>
        `- **${finding.status} / ${finding.id}:** ${reasons[finding.reason]}`) :
        ['- All recorded checks passed; this does not prove unlisted workflows.']));
    if (!provenance.sourceSha256 || !provenance.checksSha256 || !provenance.validatorSha256 ||
        !provenance.workbookRevision || !provenance.validatorRevision ||
        provenance.workbookDirty !== false || provenance.validatorDirty !== false) {
        lines.push('- Revision provenance is incomplete or modified. Content hashes describe the tested snapshot, not an unqualified clean-commit pass.');
    }
    lines.push('- An authorized reviewer must assess the evidence and remaining gaps. This report does not sign in the reviewer, grant approval, validate unlisted scenarios, or approve screenshot publication.',
        '- A blocked report remains blocked. Start a fresh authenticated run after the user completes sign-in; keep older runs separate.',
        '');
    return lines.join('\n');
}

function readValidationProvenance(workbookPath, source, plan) {
    const digest = value => crypto.createHash('sha256').update(value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')).digest('hex');
    function git(directory, args) {
        const result = spawnSync('git', ['--no-pager', '-C', directory, ...args], {
            encoding: 'utf8', windowsHide: true, timeout: 15000,
            maxBuffer: Math.max(1024 * 1024, Buffer.byteLength(source, 'utf8') * 2 + 1024)
        });
        if (result.error) throw result.error;
        return result;
    }
    function revision(directory, files) {
        const head = git(directory, ['rev-parse', 'HEAD']);
        if (head.status !== 0) return { revision: null, dirty: null };
        const status = git(directory, ['status', '--porcelain', '--', ...files]);
        if (status.status !== 0) throw new Error('Cannot determine evidence source working-copy status.');
        return { revision: head.stdout.trim(), dirty: Boolean(status.stdout.trim()) };
    }
    const workbook = path.resolve(workbookPath);
    const implementation = ['workbookBrowserValidator.js', 'workbookValidationReport.js',
        'workbookValidation.test.js', 'generateScript.js', 'report.js'].map(file => path.join(__dirname, file));
    const workbookState = revision(path.dirname(workbook), [workbook]);
    const validatorState = revision(__dirname, implementation);
    if (workbookState.revision && !workbookState.dirty) {
        const prefix = git(path.dirname(workbook), ['rev-parse', '--show-prefix']);
        if (prefix.status !== 0) throw new Error('Cannot determine workbook source revision path.');
        const committed = git(path.dirname(workbook),
            ['show', `${workbookState.revision}:${prefix.stdout.replace(/\r?\n$/, '')}${path.basename(workbook)}`]);
        workbookState.dirty = committed.status !== 0 || digest(committed.stdout) !== digest(source);
    }
    return {
        sourceSha256: digest(source),
        checksSha256: plan ? digest(validationContractSource(plan)) : null,
        validatorSha256: digest(implementation.map(file => `${path.basename(file)}\n${fs.readFileSync(file, 'utf8')}`).join('\n')),
        workbookRevision: workbookState.revision,
        workbookDirty: workbookState.dirty,
        validatorRevision: validatorState.revision,
        validatorDirty: validatorState.dirty
    };
}

function writeValidationReport(report, prefix) {
    const safe = publicValidationReport(report);
    if (typeof prefix !== 'string' || !prefix.trim() || /^(?:[a-z]+:\/\/|[\\/]{2})/i.test(prefix) ||
        /[\x00-\x1f]/.test(prefix)) {
        throw new Error('Choose a private local report filename prefix, not a URL or network share.');
    }
    const json = `${prefix}.json`;
    const markdown = `${prefix}.md`;
    if (fs.existsSync(json) || fs.existsSync(markdown)) throw new Error('Report output already exists; choose a fresh prefix.');
    fs.mkdirSync(path.dirname(path.resolve(prefix)), { recursive: true });
    fs.writeFileSync(json, `${JSON.stringify(safe, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.writeFileSync(markdown, formatValidationReport(safe), { encoding: 'utf8', flag: 'wx' });
    return { json, markdown };
}

module.exports = {
    validationContractSource,
    createValidationReport,
    recordValidationCheck,
    finishValidationReport,
    publicValidationReport,
    formatValidationReport,
    readValidationProvenance,
    writeValidationReport
};
