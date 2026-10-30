const assert = require('chai').assert;
const { rejects } = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
    createValidationPlan, auditGridRows, readScreenshotState, clearScreenshotState, waitForRenderReady,
    activateWorkbookControl
} = require('./browser/workbookBrowserValidator');

const source = fs.readFileSync(path.join(__dirname, 'browser', 'fixtures', 'Smoke.workbook'), 'utf8');
const base = {
    tab: 'Overview', trigger: 'Show details', heading: 'Deferred table',
    auditRows: true, maxRows: 20, nonEmptyColumns: ['Label']
};

function gridFixture(count = '1', headers = ['Label', 'Count']) {
    return {
        isConnected: true,
        scrollHeight: 100,
        clientHeight: 100,
        getAttribute: () => count,
        querySelectorAll: selector => selector === '[role="columnheader"]' ?
            headers.map(textContent => ({ textContent })) : []
    };
}

describe('Validating generic render/audit contracts...', () => {
    it('requires explicit bounded work for full-row audits', () => {
        const check = { ...base };
        delete check.maxRows;
        assert.throws(() => createValidationPlan(source, { deferred: [check] }), /require maxRows/);
        assert.throws(() => createValidationPlan(source, {
            deferred: [{ ...base, auditRows: 'true' }]
        }), /must be a boolean/);
        const plan = createValidationPlan(source, { deferred: [base] });
        assert.isTrue(plan.deferred[0].auditRows);
        assert.deepEqual(plan.deferred[0].nonEmptyColumns, ['Label']);
    });

    it('refuses typoed or ambiguous column contracts rather than skipping blank checks', () => {
        for (const invalid of [{ auditRows: false }, { nonEmptyColumns: [] },
            { nonEmptyColumns: ['Label', 'Label'] }, { columns: ['Count'] }]) {
            assert.throws(() => createValidationPlan(source, { deferred: [{ ...base, ...invalid }] }));
        }
    });

    it('does not make full-row auditing part of unspecified contracts', () => {
        const plan = createValidationPlan(source, {
            deferred: [{ trigger: 'Show details', heading: 'Deferred table' }]
        });
        assert.isFalse(plan.deferred[0].auditRows);
        assert.deepEqual(plan.deferred[0].nonEmptyColumns, []);
    });

    it('rejects missing/invalid ARIA totals before attempting traversal', async () => {
        for (const count of [null, 'unknown', '-1', '0']) {
            await rejects(auditGridRows(gridFixture(count), {
                maxRows: 20, timeout: 1000, nonEmptyColumns: []
            }), /reliable aria-rowcount/);
        }
    });

    it('enforces maxRows and unique column mapping before scrolling', async () => {
        await rejects(auditGridRows(gridFixture('22'), {
            maxRows: 20, timeout: 1000, nonEmptyColumns: []
        }), /exceeds/);
        await rejects(auditGridRows(gridFixture('1', ['Label', 'Label']), {
            maxRows: 20, timeout: 1000, nonEmptyColumns: ['Label']
        }), /Cannot identify one audit column/);
        await rejects(auditGridRows(gridFixture('1'), {
            maxRows: 20, timeout: 1000, nonEmptyColumns: ['Unknown']
        }), /Cannot identify/);
    });

    it('reports an empty existing grid as zero audited rows, not as healthy coverage', async () => {
        const result = await auditGridRows(gridFixture(), {
            maxRows: 20, timeout: 1000, nonEmptyColumns: ['Label']
        });
        assert.deepEqual(result, { rowsAudited: 0, totalRows: 0, nonEmptyColumnsVerified: ['Label'] });
        assert.notProperty(result, 'healthy');
    });

    it('validates runtime audit and readiness budgets instead of allowing an unbounded zero timeout', async () => {
        for (const timeout of [0, -1, 120001, '30000']) {
            await rejects(auditGridRows(gridFixture(), { maxRows: 20, timeout, nonEmptyColumns: [] }), /bounded/);
            await rejects(waitForRenderReady({}, timeout), /Render timeout/);
        }
    });

    it('passes the configured control timeout through both readiness and native activation', async () => {
        const calls = [];
        await activateWorkbookControl({
            async waitFor(options) { calls.push(['ready', options.timeout]); },
            async isEnabled(options) { calls.push(['enabled', options.timeout]); return true; },
            async press(key, options) { calls.push([key, options.timeout]); }
        }, 1234);
        assert.deepEqual(calls, [['ready', 1234], ['enabled', 1234], ['Enter', 1234]]);
    });

    it('times out readiness even when a background host stops delivering animation frames', async () => {
        const wait = vm.runInNewContext(`(${waitForRenderReady.toString()})`, {
            setTimeout, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {}
        });
        const busy = { getClientRects: () => [1],
            ownerDocument: { defaultView: { getComputedStyle: () => ({ visibility: 'visible' }) } } };
        await rejects(wait({ isConnected: true, querySelectorAll: () => [busy] }, 25), /Timed out/);
    });

    function captureBody({ marker = 'unit', style = true, effective = true } = {}) {
        const masked = {};
        const body = {
            isConnected: true,
            getAttribute: () => marker,
            querySelector: () => masked,
            querySelectorAll: () => [],
            ownerDocument: {
                querySelector: () => style ? {} : null,
                querySelectorAll: () => [{ scrollTop: 12.4, scrollLeft: 0 }],
                defaultView: {
                    innerWidth: 800, innerHeight: 600,
                    getComputedStyle: () => ({
                        getPropertyValue: () => effective ? 'rgba(0, 0, 0, 0)' : 'rgb(0, 0, 0)'
                    })
                }
            }
        };
        body.ownerDocument.body = body;
        return body;
    }

    it('captures only geometry and scroll offsets, not rendered values', () => {
        const result = readScreenshotState(captureBody(), { marker: 'unit', file: 'capture.png', redaction: 'auto' });
        assert.deepEqual(result, { width: 800, height: 600, scroll: [[12, 0]] });
    });

    it('fails closed for replaced documents, lost styles, or ineffective redaction', () => {
        for (const body of [captureBody({ marker: 'different' }), captureBody({ style: false }),
            captureBody({ effective: false })]) {
            assert.throws(() => readScreenshotState(body, {
                marker: 'unit', file: 'capture.png', redaction: 'auto'
            }), /Capture rejected.*Discard/);
        }
        const disconnected = captureBody();
        disconnected.isConnected = false;
        assert.throws(() => readScreenshotState(disconnected, {
            marker: 'unit', file: 'capture.png', redaction: 'auto'
        }), /Capture rejected/);
    });

    it('does not remove another concurrent capture marker during cleanup', () => {
        const removed = [];
        clearScreenshotState({
            getAttribute: () => 'another-capture',
            removeAttribute: name => removed.push(name),
            querySelectorAll: () => [],
            ownerDocument: { querySelectorAll: () => [] }
        }, 'unit');
        assert.deepEqual(removed, []);
    });
});
