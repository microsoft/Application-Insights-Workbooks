const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

describe('Validating serverless cost summary...', () => {
    const workbook = JSON.parse(fs.readFileSync(path.join(
        'Workbooks', 'Azure Security Center', 'Cost Estimation', 'CostEstimation.workbook'
    ), 'utf8'));
    const summaries = [];
    const totals = [];
    const azureTables = [];
    const otherCloudTables = [];

    function findSummaries(value) {
        if (!value || typeof value !== 'object') {
            return;
        }
        if (value.name === 'Serverless CSPM summary') {
            summaries.push(value.content);
        }
        if (value.content && value.content.title === 'Grand total (known costs)') {
            totals.push(value.content);
        }
        if (value.content && value.content.title === 'Azure') {
            azureTables.push(value.content);
        }
        if (value.content && ['AWS', 'GCP'].includes(value.content.title)) {
            otherCloudTables.push(value.content);
        }
        Object.values(value).forEach(findSummaries);
    }

    findSummaries(workbook);

    it('shows one subscription as the Resource Manager billing quantity in both modes', () => {
        assert.lengthOf(azureTables, 2);
        azureTables.forEach(table => {
            const formatter = table.gridSettings.formatters.find(
                item => item.columnMatch === 'defenderForArmCost');
            assert.exists(formatter);
            assert.equal(formatter.formatOptions.thresholdsGrid.find(
                threshold => threshold.operator === 'Default').text, '{0} (1 subscription)');
        });
    });

    ['AWS', 'GCP'].forEach(cloud => {
        it(`hides the ${cloud} status column in both modes`, () => {
            const tables = otherCloudTables.filter(table => table.title === cloud);
            assert.lengthOf(tables, 2);
            tables.forEach(table => {
                assert.deepEqual(table.gridSettings.formatters.filter(
                    formatter => formatter.columnMatch === 'ServerlessUnpricedInputs'), [
                    { columnMatch: 'ServerlessUnpricedInputs', formatter: 5 }
                ]);
            });
        });
    });

    it('hides the Azure subscription status column in both modes', () => {
        assert.lengthOf(azureTables, 2);
        azureTables.forEach(table => {
            assert.deepEqual(table.gridSettings.formatters.filter(
                formatter => formatter.columnMatch === 'ServerlessUnpricedInputs'), [
                { columnMatch: 'ServerlessUnpricedInputs', formatter: 5 }
            ]);
        });
    });

    it('hides the grand-total status column in both modes without removing its source data', () => {
        assert.lengthOf(totals, 2);
        totals.forEach(total => {
            const formatters = total.gridSettings.formatters.filter(
                formatter => formatter.columnMatch === 'Unpriced serverless inputs');
            assert.deepEqual(formatters, [
                { columnMatch: 'Unpriced serverless inputs', formatter: 5 }
            ]);
            assert.equal(JSON.parse(total.query).version, 'Merge/1.0');
        });
    });

    it('covers both subscription and tenant modes', () => {
        assert.lengthOf(summaries, 2);
        assert.sameMembers(summaries.map(summary => summary.resourceType), [
            'microsoft.resourcegraph/resources',
            'microsoft.resources/tenants'
        ]);
    });

    ['microsoft.resourcegraph/resources', 'microsoft.resources/tenants'].forEach(resourceType => {
        it(`${resourceType} distinguishes resource and billable quantities without a status column`, () => {
            const summary = summaries.find(item => item.resourceType === resourceType);
            assert.exists(summary);
            assert.deepEqual(summary.gridSettings.labelSettings, [
                { columnId: 'Cloud', label: 'Cloud' },
                { columnId: 'Component', label: 'Component' },
                { columnId: 'KnownQuantity', label: 'Resource quantity' },
                { columnId: 'BillableUnits', label: 'Equivalent billable quantity' },
                { columnId: 'KnownMonthlyCost', label: 'Included monthly cost (USD)' }
            ]);
            assert.include(summary.query,
                '| extend BillableUnits = KnownQuantity / iff(Component == "protection", 8.0, 2.0)');
            assert.notMatch(summary.query, /\b(ceil|ceiling|round|toint|tolong)\(KnownQuantity/);
            assert.notInclude(summary.query, '| extend Status =');
            assert.include(summary.query,
                '| extend MonthlyRate = todouble({retailPricing:$.monthly.cspm}) / iff(Component == "protection", 8.0, 2.0) * {discountToMultiplyVal}');
            assert.include(summary.query, '| extend KnownMonthlyCost = KnownQuantity * MonthlyRate');
            assert.include(summary.query, 'KnownQuantity = sum(KnownQuantity)');
            assert.include(summary.query,
                '| project Cloud, Component, KnownQuantity, BillableUnits, KnownMonthlyCost = iff(UnpricedInputs > 0 and KnownQuantity == 0.0, real(null), KnownMonthlyCost)');
            assert.equal((summary.query.match(/\{discountToMultiplyVal\}/g) || []).length, 1);
        });
    });
});
