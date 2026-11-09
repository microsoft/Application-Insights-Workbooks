const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

describe('Validating serverless cost summary...', () => {
    const workbook = JSON.parse(fs.readFileSync(path.join(
        'Workbooks', 'Azure Security Center', 'Cost Estimation', 'CostEstimation.workbook'
    ), 'utf8'));
    const summaries = [];

    function findSummaries(value) {
        if (!value || typeof value !== 'object') {
            return;
        }
        if (value.name === 'Serverless CSPM summary') {
            summaries.push(value.content);
        }
        Object.values(value).forEach(findSummaries);
    }

    findSummaries(workbook);

    it('covers both subscription and tenant modes', () => {
        assert.lengthOf(summaries, 2);
        assert.sameMembers(summaries.map(summary => summary.resourceType), [
            'microsoft.resourcegraph/resources',
            'microsoft.resources/tenants'
        ]);
    });

    ['microsoft.resourcegraph/resources', 'microsoft.resources/tenants'].forEach(resourceType => {
        it(`${resourceType} shows quantity and monthly cost without pricing-unit or status columns`, () => {
            const summary = summaries.find(item => item.resourceType === resourceType);
            assert.exists(summary);
            assert.deepEqual(summary.gridSettings.labelSettings, [
                { columnId: 'Cloud', label: 'Cloud' },
                { columnId: 'Component', label: 'Component' },
                { columnId: 'KnownQuantity', label: 'Quantity' },
                { columnId: 'KnownMonthlyCost', label: 'Included monthly cost (USD)' }
            ]);
            assert.notInclude(summary.query, 'BillableUnits');
            assert.notInclude(summary.query, '| extend Status =');
            assert.include(summary.query,
                '| extend MonthlyRate = todouble({retailPricing:$.monthly.cspm}) / iff(Component == "protection", 8.0, 2.0) * {discountToMultiplyVal}');
            assert.include(summary.query, '| extend KnownMonthlyCost = KnownQuantity * MonthlyRate');
            assert.include(summary.query, 'KnownQuantity = sum(KnownQuantity)');
            assert.include(summary.query,
                '| project Cloud, Component, KnownQuantity, KnownMonthlyCost = iff(UnpricedInputs > 0 and KnownQuantity == 0.0, real(null), KnownMonthlyCost)');
            assert.equal((summary.query.match(/\{discountToMultiplyVal\}/g) || []).length, 1);
        });
    });
});
