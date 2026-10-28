const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

const workbook = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'Workbooks',
    'Azure Active Directory Conditional Access', 'Policy Plans Insights Preview',
    'PolicyPlansInsights.workbook'), 'utf8'));

function flatten(items) {
    return items.flatMap(item => [item, ...(item.type === 12 ? flatten(item.content.items) : [])]);
}

const items = flatten(workbook.items);
const queries = items.filter(item => item.type === 3);

function metrics(item) {
    const matches = [...item.content.query.matchAll(/\| where Metric in \(([^)]+)\)/g)];
    assert.isNotEmpty(matches, item.name);
    return JSON.parse(`[${matches[matches.length - 1][1]}]`);
}

describe('Policy Plans insights review regressions', () => {
    it('warns about incomplete evaluation evidence even when Guide is off', () => {
        const notices = queries.filter(item => item.name.endsWith(' source readiness'));
        assert.lengthOf(notices, 3);
        for (const item of notices) {
            assert.notProperty(item, 'conditionalVisibility', item.name);
            assert.match(item.content.query,
                /let IncompleteEvidence = toscalar\(SideRows[\s\S]*countif\(Outcome == "Unavailable"[\s\S]*Mode in \("Partially available", "Unavailable"\)/,
                item.name);
            assert.include(item.content.query, 'IncompleteEvidence, "Incomplete evaluation evidence:', item.name);
            assert.include(item.content.query, 'zero does not establish no impact', item.name);
        }
    });

    it('rejects mixed presets and individuals instead of silently querying a subset', () => {
        const consumers = queries.filter(item => item.content.query.includes('let InputA ='));
        assert.isNotEmpty(consumers);
        for (const item of consumers) {
            assert.include(item.content.query, 'array_length(Presets) == 0', item.name);
            assert.include(item.content.query,
                'array_length(Presets) == 1 and array_length(set_difference(Values, Presets)) == 0',
                item.name);
            assert.include(item.content.query, '| where ValidSelection(Values)', item.name);
            assert.include(item.content.query,
                'let SelectionAResolved = InventoryReady and ValidSelection(InputA)', item.name);
            assert.include(item.content.query,
                'let SelectionBResolved = InventoryReady and ValidSelection(InputB)', item.name);
        }
        const comparison = queries.find(item => item.name === 'Compare CA to CAv2 source readiness');
        assert.include(comparison.content.query, 'not(SelectionInputsValid)', comparison.name);
        assert.include(comparison.content.query, 'Clear the preset before choosing individual objects', comparison.name);
    });

    it('restores user action reporting and drilldown without adding comparison or workload cards', () => {
        const tiles = queries.filter(item => item.content.visualization === 'tiles');
        assert.lengthOf(tiles, 4);
        for (const item of tiles) {
            const expected = ['Total', 'Success', 'Failure', 'Not applied'];
            if (item.name === 'user outcome tiles') {
                expected.push('User action required');
                assert.include(item.content.query, 'Token == "reportonlyinterrupted"', item.name);
                assert.include(item.content.query, '| extend ResultToken=Metric', item.name);
                assert.equal(item.content.exportFieldName, 'ResultToken', item.name);
            }
            assert.deepEqual(metrics(item), expected, item.name);
        }
        const events = queries.find(item => item.name === 'user sign-in events');
        assert.include(events.content.query, 'CardResult == "Total" or AResult == CardResult');
    });

    it('uses case-insensitive exact matching for all advertised principal and application filters', () => {
        const historical = queries.filter(item => item.content.query.includes('let RawEvents ='));
        assert.isNotEmpty(historical);
        for (const item of historical) {
            assert.notMatch(item.content.query, /\bhas (?:AppFilter|PrincipalFilter)\b/, item.name);
            if (item.content.query.includes('let UserEvents =')) {
                assert.include(item.content.query, 'UserPrincipalName =~ PrincipalFilter', item.name);
                assert.include(item.content.query, 'AppDisplayName =~ AppFilter', item.name);
            }
            if (item.content.query.includes('let WorkloadEvents =')) {
                assert.include(item.content.query, 'ServicePrincipalId =~ PrincipalFilter', item.name);
                assert.include(item.content.query, 'ResourceDisplayName =~ AppFilter', item.name);
            }
        }
    });
});
