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

    it('uses discovery only without forecast controls, overrides, or stale guidance', () => {
        const serialized = JSON.stringify(workbook);
        assert.notMatch(serialized, /forecast|override|ServerlessProtectionAverage|ServerlessContainersAverage/i);
        summaries.forEach(summary => {
            assert.include(summary.query,
                '| extend KnownQuantity = iff(Cloud == "Azure" and AutoValid, AutoQuantity, 0.0)');
            assert.include(summary.query,
                '| extend UnpricedInputs = iff(Cloud == "Azure" and AutoValid, AutoMissing, 1)');
        });
        [...azureTables, ...otherCloudTables.filter(table => table.title === 'AWS')].forEach(table => {
            assert.notMatch(table.query, /SLPProvided|SLCProvided|SLPText|SLCText/);
        });
    });

    it('uses the expanded CSPM column name across all cloud and total tables in both modes', () => {
        const tables = [...totals, ...azureTables, ...otherCloudTables];
        assert.lengthOf(tables, 8);
        tables.forEach(table => {
            assert.deepInclude(table.gridSettings.labelSettings, {
                columnId: 'Defender CSPM',
                label: 'Microsoft Cloud Security Posture Management'
            });
        });
    });

    it('labels the final cost column consistently across all cost tables in both modes', () => {
        const tables = [...totals, ...azureTables, ...otherCloudTables, ...summaries];
        assert.lengthOf(tables, 10);
        tables.forEach(table => {
            const column = table.gridSettings.labelSettings.at(-1);
            assert.equal(column.label, 'Monthly cost (USD)');
            assert.include([
                'Grand total', 'Total for subscription', 'Total for AWS account',
                'Total for GCP project', 'KnownMonthlyCost'
            ], column.columnId);
        });
    });

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
                { columnId: 'BillableUnits', label: 'Billable quantity' },
                { columnId: 'KnownMonthlyCost', label: 'Monthly cost (USD)' }
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
                '| project Cloud, Component, KnownQuantity, BillableUnits, KnownMonthlyCost = iff(UnpricedInputs > 0 and KnownQuantity == 0.0, real(null), KnownMonthlyCost), ResourceKind');
            assert.include(summary.query,
                '| extend ResourceKind = iff(Component == "protection", iff(Cloud == "AWS", "Lambda functions", "apps/functions"), "running containers")');
            const quantityFormatter = summary.gridSettings.formatters.find(
                item => item.columnMatch === 'KnownQuantity');
            assert.exists(quantityFormatter);
            assert.equal(quantityFormatter.formatOptions.thresholdsGrid[0].text,
                '{0} (["ResourceKind"])');
            assert.deepInclude(summary.gridSettings.formatters,
                { columnMatch: 'ResourceKind', formatter: 5 });
            assert.equal((summary.query.match(/\{discountToMultiplyVal\}/g) || []).length, 1);
        });
    });
});
