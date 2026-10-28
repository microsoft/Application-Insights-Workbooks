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
    it('keeps the approved preview label without diagnostic rows or introductory disclosures', () => {
        const tabs = items.find(item => item.name === 'Workbook tabs').content.links;
        assert.equal(tabs.find(link => link.subTarget === 'comparison').linkLabel,
            'Compare CA to policy plans (Preview)');
        for (const item of items) {
            assert.notEqual(item.name, 'Live source status');
            assert.isFalse(item.name.endsWith(' source readiness'), item.name);
            assert.notInclude(['Live data disclosure', 'Synthetic data disclosure', 'Workbook usage guidance'],
                item.name);
            assert.notInclude(JSON.stringify(item.content), 'Review Live source status', item.name);
        }
    });

    it('separates comparison presets from conditional individual pickers and retains query guards', () => {
        const parameters = items.filter(item => item.type === 9)
            .flatMap(item => item.content.parameters);
        for (const [side, defaultValue] of [
            ['SelectionA', 'aggregate-enabled-ca'], ['SelectionB', 'aggregate-enabled-rules']
        ]) {
            const mode = parameters.find(parameter => parameter.name === `${side}Mode`);
            assert.isFalse(mode.multiSelect, side);
            assert.equal(mode.value, defaultValue, side);
            assert.include(JSON.parse(mode.jsonData).map(option => option.value), 'individual', side);
            const individuals = items.find(item => item.name === `${side} individuals`);
            assert.deepEqual(individuals.conditionalVisibility, {
                parameterName: `${side}Mode`, comparison: 'isEqualTo', value: 'individual'
            });
            const picker = individuals.content.parameters[0];
            assert.equal(picker.name, side);
            assert.isTrue(picker.multiSelect, side);
            assert.isFalse(picker.isRequired, side);
            assert.deepEqual(picker.value, [], side);
            assert.notInclude(picker.query, 'let Presets=', side);
            assert.include(picker.query, 'selected=false', side);
        }
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
            if (item.content.query.includes('{SelectionAMode:base64}')) {
                for (const side of ['SelectionA', 'SelectionB']) {
                    assert.include(item.content.query,
                        `iff(base64_decode_tostring('{${side}Mode:base64}') == "individual", dynamic([{${side}}]), ` +
                        `pack_array(base64_decode_tostring('{${side}Mode:base64}')))`, item.name);
                }
            }
        }
    });

    it('supports multiple individual policies and rules in both reporting views', () => {
        const parameters = items.filter(item => item.type === 9)
            .flatMap(item => item.content.parameters);
        for (const [identity, groupName] of [
            ['user', 'user reporting'], ['servicePrincipal', 'servicePrincipal reporting']
        ]) {
            const name = `Policy_${identity}`;
            const mode = parameters.find(parameter => parameter.name === `${name}Mode`);
            assert.isDefined(mode, identity);
            assert.isFalse(mode.multiSelect, identity);
            assert.equal(mode.value, 'aggregate-all-enabled', identity);
            const individualBlock = items.find(item => item.name === `${name} individuals`);
            assert.deepEqual(individualBlock.conditionalVisibility, {
                parameterName: `${name}Mode`, comparison: 'isEqualTo', value: 'individual'
            });
            const picker = individualBlock.content.parameters[0];
            assert.equal(picker.name, name);
            assert.isTrue(picker.multiSelect, identity);
            assert.equal(picker.quote, '"', identity);
            assert.equal(picker.delimiter, ',', identity);
            assert.deepEqual(picker.value, [], identity);
            assert.isFalse(picker.isRequired, identity);
            assert.notInclude(picker.query, 'let Presets=', identity);
            const group = items.find(item => item.name === groupName);
            const consumers = flatten(group.content.items).filter(item => item.type === 3);
            assert.isNotEmpty(consumers, identity);
            for (const item of consumers) {
                assert.include(item.content.query,
                    `let InputA = iff(base64_decode_tostring('{${name}Mode:base64}') == "individual", ` +
                    `dynamic([{${name}}]), pack_array(base64_decode_tostring('{${name}Mode:base64}')));`,
                    item.name);
                assert.notInclude(item.content.query, `{${name}:base64}`, item.name);
            }
        }
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
