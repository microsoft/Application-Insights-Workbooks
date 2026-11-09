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

    ['subscriptionGroup', 'tenantGroup'].forEach(groupName => {
        it(`${groupName} gates API costs and queries documented live usage without changing plan pricing`, () => {
            const items = workbook.items.find(item => item.name === groupName).content.items;
            const tenant = groupName === 'tenantGroup';
            const control = items.find(item => item.name === 'Defender for APIs inclusion').content.parameters[0];
            assert.equal(control.name, 'includeDefenderApis');
            assert.equal(control.type, 10);
            assert.equal(control.value, '1');
            assert.sameMembers(JSON.parse(control.jsonData).map(option => option.value), ['0', '1']);
            const pricing = items.find(item => item.name === (tenant ? 'pricing grid - tenant' : 'pricing grid'));
            assert.include(pricing.content.query,
                "iff(tolong('{AzureAPISubPlans}')==1 and tolong('{includeDefenderApis}')==1,");
            const scope = items.find(item => item.name === 'Defender for APIs usage scope').content.parameters;
            const entitlement = scope.find(parameter => parameter.name === 'apiPlanEntitlement');
            assert.deepEqual(entitlement.criteriaData.slice(0, 5).map(row => row.criteriaContext.resultVal),
                ['1,000,000', '5,000,000', '50,000,000', '100,000,000', '1,000,000,000']);
            const resources = scope.find(parameter => parameter.name === 'apiManagementServices');
            assert.include(resources.query, 'type =~ "microsoft.apimanagement/service"');
            assert.equal(resources.resourceType,
                tenant ? 'microsoft.resources/tenants' : 'microsoft.resourcegraph/resources');
            if (!tenant) assert.deepEqual(resources.crossComponentResources, ['{Subscriptions}']);
            const detail = items.at(-1);
            assert.equal(detail.name, 'Defender for API estimate');
            assert.deepInclude(detail.conditionalVisibilities,
                { parameterName: 'includeDefenderApis', comparison: 'isEqualTo', value: '1' });
            assert.deepInclude(detail.conditionalVisibilities,
                { parameterName: 'AzureAPISubPlans', comparison: 'isEqualTo', value: '1' });
            const [guidance, dropdown, apply, metrics, costs, usage, comparison] =
                detail.content.items.map(item => item.content);
            assert.include(guidance.json, 'https://learn.microsoft.com/azure/defender-for-cloud/defender-for-apis-deploy');
            assert.include(guidance.json, 'not calendar-month billing');
            assert.include(guidance.json, 'The overall estimate includes base fees only');
            assert.include(guidance.json, 'copy one subscription subtotal');
            assert.include(guidance.json, 'user-entered planning scenario');
            const planName = tenant ? 'azureAPIPlanValTenant' : 'azureAPIPlanVal';
            const applied = items.find(item => item.name === 'Applied Defender for API plan').content.parameters;
            assert.equal(applied[0].name, planName);
            assert.isTrue(applied[0].isGlobal);
            assert.isTrue(applied[0].isHiddenWhenLocked);
            assert.isBelow(items.findIndex(item => item.name === 'Applied Defender for API plan'),
                items.findIndex(item => item.name === 'Defender for APIs usage scope'));
            assert.equal(dropdown.parameters[0].name, `${planName}WhatIf`);
            assert.equal(apply.links[0].cellValue, planName);
            assert.equal(apply.links[0].linkTarget, 'parameter');
            assert.equal(apply.links[0].subTarget, `{${planName}WhatIf}`);
            assert.equal(metrics.version, 'MetricsItem/2.0');
            assert.deepEqual(metrics.resourceIds, ['{apiManagementServices}']);
            assert.equal(metrics.timeContext.durationMs, 30 * 24 * 60 * 60 * 1000);
            assert.deepEqual(metrics.metrics, [{
                namespace: 'microsoft.apimanagement/service',
                metric: 'microsoft.apimanagement/service-Gateway Requests-Requests',
                aggregation: 1
            }]);
            assert.deepEqual(metrics.gridSettings.hierarchySettings.groupBy, ['Subscription']);
            assert.notProperty(metrics, 'exportedParameters');
            assert.include(costs.query, '| summarize ApiManagementServices = count() by Subscription');
            assert.include(costs.query,
                `MonthlyCost = todouble("{azureAPIMonthlyPrice${tenant ? 'Tenant' : ''}}") * {discountToMultiplyVal}`);
            assert.equal(costs.gridSettings.labelSettings.at(-1).label, 'Monthly cost (USD)');
            assert.equal(usage.parameters[0].name, 'apiPlanningRequests');
            assert.equal(usage.parameters[0].value, '');
            assert.isFalse(usage.parameters[0].isRequired);
            assert.include(comparison.query, 'RequestsText matches regex @"^[0-9]+$"');
            assert.include(comparison.query, 'Requests <= 9007199254740991.0');
            assert.include(comparison.query, 'OverageRequests = max_of(Requests - Entitlement, 0.0)');
            assert.include(comparison.query,
                'BaseCost = BaseFee * {discountToMultiplyVal}, OverageCost = OverageRequests * OverageRate * {discountToMultiplyVal}');
            assert.include(comparison.query, 'MonthlyCost = BaseCost + OverageCost');
            assert.include(comparison.query, `Selector == "{${planName}WhatIf}"`);
            assert.include(comparison.query, 'MinimumCost = min_of(Cost1, Cost2, Cost3, Cost4, Cost5)');
            assert.include(comparison.query,
                'case(Cost1 == MinimumCost, "Plan 1", Cost2 == MinimumCost, "Plan 2"');
            assert.equal(comparison.gridSettings.labelSettings.at(-1).label, 'Monthly cost (USD)');
            assert.notInclude(pricing.content.query, 'apiPlanningRequests');
            assert.notInclude(pricing.content.query, 'OverageCost');
            const table = azureTables[tenant ? 1 : 0];
            const format = table.gridSettings.formatters.find(item => item.columnMatch === 'defenderForApiCost');
            assert.deepInclude(table.gridSettings.labelSettings,
                { columnId: 'defenderForApiCost', label: 'Defender for API' });
            assert.equal(format.formatOptions.thresholdsGrid.find(row => row.operator === 'Default').text,
                '{0} ({apiPlanEntitlement} requests/month entitlement)');
        });
    });

    it('uses discovery only without forecast controls, overrides, or stale guidance', () => {
        const serialized = JSON.stringify(workbook);
        assert.notMatch(serialized, /ServerlessProtectionAverage|ServerlessContainersAverage/);
        summaries.forEach(summary => {
            assert.notMatch(summary.query, /forecast|override/i);
            assert.include(summary.query,
                '| extend KnownQuantity = iff(Cloud == "Azure" and AutoValid, AutoQuantity, 0.0)');
            assert.include(summary.query,
                '| extend UnpricedInputs = iff(Cloud == "Azure" and AutoValid, AutoMissing, 1)');
        });

        [...azureTables, ...otherCloudTables.filter(table => table.title === 'AWS')].forEach(table => {
            assert.notMatch(table.query, /SLPProvided|SLCProvided|SLPText|SLCText/);
        });
    });

    it('compares actual five-plan query formulas at allowance boundaries and with discounts', () => {
            const snapshot = JSON.parse(workbook.items.find(item => item.name === 'Retail pricing snapshot')
                .content.parameters[0].value);
            assert.deepEqual(Object.values(snapshot.apiPlanning.entitlements),
                [1000000, 5000000, 50000000, 100000000, 1000000000]);
            assert.deepEqual(Object.values(snapshot.apiPlanning.overagePerCall),
                [0.0002, 0.00014, 0.0001, 0.00007, 0.00005]);
            assert.equal(snapshot.apiPlanning.source, 'https://azure.microsoft.com/en-us/pricing/details/defender-for-cloud/');
            ['subscriptionGroup', 'tenantGroup'].forEach(groupName => {
                const query = workbook.items.find(item => item.name === groupName).content.items.at(-1)
                    .content.items.find(item => item.name === 'Defender for API plan comparison').content.query;
                const formulas = query.split('\r\n').find(line => line.startsWith('| extend Cost1'))
                    .replace('| extend ', '').split(/, (?=Cost[1-5] =)/).map(formula => formula.replace(/^Cost[1-5] = /, ''));
                function calculate(requests, discount) {
                    return formulas.map(formula => {
                        const expression = formula.replace(/\{retailPricing:\$\.([^}]+)\}/g,
                            (_, key) => key.split('.').reduce((value, part) => value[part], snapshot))
                            .replaceAll('{discountToMultiplyVal}', String(discount))
                            .replaceAll('todouble(', 'Number(').replaceAll('tolong(', 'Number(')
                            .replaceAll('max_of(', 'Math.max(');
                        return Function('Requests', `return ${expression};`)(requests);
                    });
                }
                [0, 54158, 1000000].forEach(requests =>
                    assert.closeTo(calculate(requests, 1)[0], snapshot.monthly.apisP1, 0.000001));
                const above = calculate(1000001, 1);
                assert.closeTo(above[0], snapshot.monthly.apisP1 + 0.0002, 0.000001);
                const scenario = calculate(6000000, 1);
                assert.closeTo(scenario[0], 1200.02, 0.000001);
                assert.closeTo(scenario[1], 839.997, 0.000001);
                assert.equal(scenario.indexOf(Math.min(...scenario)), 1);
                calculate(6000000, 0.5).forEach((cost, index) =>
                    assert.closeTo(cost, scenario[index] * 0.5, 0.000001));
                assert.deepEqual(calculate(6000000, 0), [0, 0, 0, 0, 0]);
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
