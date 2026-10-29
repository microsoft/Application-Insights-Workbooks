const assert = require('chai').assert;
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const workbook = JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'Workbooks', 'Azure Security Center', 'Cost Estimation', 'CostEstimation.workbook'
), 'utf8'));
const optionalGroupName = 'Optional serverless CSPM estimates';
const scopes = [
    {
        name: 'subscriptionGroup', mode: '0', originalItems: 23,
        serversSelection: 'AzureP1P2', serversPlan: 'azureServersPlanVal'
    },
    {
        name: 'tenantGroup', mode: '1', originalItems: 22,
        serversSelection: 'AzureP1P2tenant', serversPlan: 'azureServersPlanValTenant'
    }
];

describe('Cost estimation workbook', () => {
    it('preserves original content apart from the corrected Servers expressions', () => {
        const baseline = JSON.parse(JSON.stringify(workbook));
        for (const scope of scopes) {
            const group = baseline.items.find(item => item.name === scope.name);
            group.content.items = group.content.items.filter(item => item.name !== optionalGroupName);
            const table = group.content.items.find(item => item.name.startsWith('pricing grid with total'));
            // Normalize only the intentional Servers fixes when comparing with the original snapshot.
            table.content.query = table.content.query
                .replace('{' + scope.serversSelection + '}', '{azureIsServersSelected}')
                .replace(/("leftOperand"\s*:\s*"ServersInRg"\s*,\s*"operator"\s*:\s*")>(")/, '$1!=$2');
        }

        // Canonical workbook at 743a77dd1a820da53508a36bdabb2ed73ea5e591, before the serverless change.
        const digest = crypto.createHash('sha256').update(JSON.stringify(baseline)).digest('hex');
        assert.strictEqual(digest, '831376022755a64361073b5014e9ba6920b80535ba3fe98f3e75e9267b680538');
    });

    for (const scope of scopes) {
        describe(scope.name, () => {
            const group = workbook.items.find(item => item.name === scope.name);
            const optional = group.content.items.find(item => item.name === optionalGroupName);
            const selector = optional.content.items.find(item => item.name === 'Additional estimate options');
            const details = optional.content.items.find(item => item.name === 'Serverless estimate details');
            const options = details.content.items.find(item => item.name === 'CSPM serverless options');
            const results = details.content.items.find(item => item.name === 'Serverless estimate results');
            const summary = results.content.items.find(item => item.name === 'Serverless CSPM summary');
            const estimates = results.content.items.find(item => item.name === 'Serverless CSPM resource estimates');
            const warning = details.content.items.find(item => item.name === 'Serverless forecast input warning');

            it('uses a numeric selection flag and skips empty server counts in Azure price expressions', () => {
                const parameters = group.content.items.flatMap(item => item.content.parameters || []);
                const numeric = parameters.find(parameter => parameter.name === scope.serversSelection);
                const boolean = parameters.find(parameter => parameter.name === 'azureIsServersSelected');
                const selected = numeric.criteriaData[0].criteriaContext;
                for (const key of ['leftOperand', 'operator', 'rightValType', 'rightVal']) {
                    assert.strictEqual(selected[key], boolean.criteriaData[0].criteriaContext[key]);
                }
                assert.strictEqual(selected.resultValType, 'static');
                assert.strictEqual(selected.resultVal, '1');
                assert.strictEqual(numeric.criteriaData[1].criteriaContext.resultVal, '0');

                const table = group.content.items.find(item => item.name.startsWith('pricing grid with total'));
                const column = JSON.parse(table.content.query).projectRename.find(item => item.mergedName === 'Servers');
                const criteria = column.newItemData[0].criteriaContext;
                assert.strictEqual(criteria.leftOperand, 'ServersInRg');
                assert.strictEqual(criteria.operator, '>');
                assert.strictEqual(criteria.rightVal, '0');
                assert.strictEqual(criteria.resultValType, 'expression');
                assert.strictEqual(criteria.resultVal.trim(),
                    '["ServersInRg"] * {' + scope.serversPlan + '} *{' + scope.serversSelection + '}*{discountToMultiplyVal}');
                assert.strictEqual(column.newItemData[1].criteriaContext.resultVal, '0');
                assert.notInclude(table.content.query, '{azureIsServersSelected}');
            });

            it('appends the estimates after the original visuals and hides them by default', () => {
                assert.lengthOf(group.content.items, scope.originalItems + 1);
                assert.strictEqual(group.content.items[group.content.items.length - 1], optional);
                assert.strictEqual(optional.content.exportParameters, false);
                assert.deepEqual(optional.conditionalVisibility, {
                    parameterName: 'istenantlevel',
                    comparison: 'isEqualTo',
                    value: scope.mode
                });
                const show = selector.content.parameters.find(item => item.name === 'showServerlessEstimates');
                assert.strictEqual(selector.content.style, 'above');
                assert.strictEqual(show.label, 'Serverless estimates');
                assert.strictEqual(show.type, 10);
                assert.strictEqual(show.value, '0');
                assert.deepEqual(show.typeSettings, { additionalResourceOptions: [], showDefault: false });
                assert.deepEqual(JSON.parse(show.jsonData), [
                    { value: '0', label: 'Hide', selected: true },
                    { value: '1', label: 'Show' }
                ]);
                assert.deepEqual(details.conditionalVisibility, {
                    parameterName: 'showServerlessEstimates',
                    comparison: 'isEqualTo',
                    value: '1'
                });
            });

            it('keeps both components independently excluded by default', () => {
                for (const name of ['serverlessProtection', 'serverlessContainers']) {
                    const parameter = options.content.parameters.find(item => item.name === name);
                    assert.strictEqual(parameter.type, 10);
                    assert.isAtMost(parameter.label.length, 22);
                    assert.strictEqual(parameter.value, '0');
                    assert.deepEqual(JSON.parse(parameter.jsonData), [
                        { value: '0', label: 'Exclude', selected: true },
                        { value: '1', label: 'Include in estimate' }
                    ]);
                }
                assert.strictEqual(options.content.parameters.find(item => item.name === 'serverlessUsage').value, '{}');
            });

            it('never makes the original visuals depend on optional inputs', () => {
                const originalItems = group.content.items.filter(item => item !== optional);
                assert.notInclude(JSON.stringify(originalItems), '{serverless');
                assert.notInclude(JSON.stringify(originalItems), '"parameterName":"serverless');
                assert.notProperty(estimates.content, 'exportedParameters');
                assert.notProperty(estimates, 'exportedParameters');
            });

            it('only shows the additional breakdown and warnings for included CSPM components', () => {
                assert.deepEqual(options.conditionalVisibility, {
                    parameterName: 'serverlessCspmSelected', comparison: 'isEqualTo', value: '1'
                });
                assert.deepEqual(results.conditionalVisibility, {
                    parameterName: 'serverlessComponentsIncluded', comparison: 'isEqualTo', value: '1'
                });
                assert.deepEqual(warning.conditionalVisibility, {
                    parameterName: 'serverlessInputsReady', comparison: 'isEqualTo', value: '0'
                });
                const selected = selector.content.parameters.find(item => item.name === 'serverlessCspmSelected');
                assert.isTrue(selected.criteriaData.filter(item => item.criteriaContext.operator !== 'Default')
                    .every(item => item.criteriaContext.operator === '=='));
                assert.include(warning.content.json, 'original charts, tables, and Grand total above are not changed or hidden');
                assert.include(summary.content.title, 'not included above');
            });

            it('rolls up to four cloud/component rows with four columns and hides resource details by default', () => {
                const detailOptions = results.content.items.find(item => item.name === 'Serverless resource detail options');
                const show = detailOptions.content.parameters.find(item => item.name === 'showServerlessResourceDetails');
                assert.strictEqual(results.content.exportParameters, true);
                assert.strictEqual(show.type, 10);
                assert.strictEqual(show.value, '0');
                assert.deepEqual(JSON.parse(show.jsonData), [
                    { value: '0', label: 'Hide', selected: true },
                    { value: '1', label: 'Show' }
                ]);
                assert.deepEqual(estimates.conditionalVisibility, {
                    parameterName: 'showServerlessResourceDetails', comparison: 'isEqualTo', value: '1'
                });
                assert.strictEqual(summary.content.gridSettings.rowLimit, 4);
                assert.deepEqual(summary.content.gridSettings.labelSettings.map(item => item.columnId),
                    ['Cloud', 'Component', 'MonthlyCost', 'Status']);
                assert.deepEqual(summary.content.gridSettings.formatters, estimates.content.gridSettings.formatters);
                assert.strictEqual(summary.content.resourceType, estimates.content.resourceType);
                assert.deepEqual(summary.content.crossComponentResources, estimates.content.crossComponentResources);
                assert.isTrue(summary.content.showExportToExcel);
                assert.isNotEmpty(summary.content.noDataMessage);
                assert.include(summary.content.query,
                    'by Cloud, Component = iff(IsProtection, "Serverless protection", "Serverless containers")');
                const projection = summary.content.query.split('\r\n').find(line =>
                    line.startsWith('| project Cloud, Component,'));
                assert.strictEqual(projection,
                    '| project Cloud, Component, MonthlyCost = iff(MissingInputs == 0, MonthlyCost, real(null)), Status = iff(MissingInputs == 0, "Complete forecast", "Input required: show resource details")');
            });

            it('uses the same validated inputs and discounted costs for the summary and resource details', () => {
                const detailPipeline = estimates.content.query.split('\r\n| project Cloud, ScopeKey, Workload,')[0];
                const summaryPipeline = summary.content.query.split('\r\n| summarize MonthlyCost')[0];
                assert.strictEqual(summaryPipeline, detailPipeline);
                assert.include(summary.content.query,
                    'MonthlyCost = sum(MonthlyCost), MissingInputs = countif(not(InputValid))');
                assert.include(summary.content.query, 'MonthlyCost = iff(MissingInputs == 0, MonthlyCost, real(null))');
            });

            it('preserves scope selection and exposes missing inputs instead of zero costs', () => {
                const readiness = options.content.parameters.find(item => item.name === 'serverlessInputsReady');
                assert.include(readiness.query, '| project value = iff(MissingScopes == 0, "1", "0")');
                const resourceType = scope.mode === '1'
                    ? 'microsoft.resources/tenants'
                    : 'microsoft.resourcegraph/resources';
                assert.strictEqual(options.content.resourceType, resourceType);
                assert.strictEqual(readiness.resourceType, resourceType);
                assert.strictEqual(estimates.content.resourceType, resourceType);
                if (scope.mode === '0') {
                    assert.deepEqual(estimates.content.crossComponentResources, ['{Subscriptions}']);
                    assert.deepEqual(readiness.crossComponentResources, ['{Subscriptions}']);
                    assert.include(estimates.content.query, '{AWSSecurityConnectors}');
                    assert.include(readiness.query, '{AWSSecurityConnectors}');
                } else {
                    assert.deepEqual(estimates.content.crossComponentResources, ['value::tenant']);
                    assert.deepEqual(readiness.crossComponentResources, ['value::tenant']);
                    assert.notInclude(JSON.stringify([estimates, readiness]), '{Subscriptions}');
                    assert.notInclude(estimates.content.query, '{AWSSecurityConnectors}');
                }
                assert.include(estimates.content.query, 'MonthlyAverage / ResourcesPerUnit, real(null)');
                assert.include(estimates.content.query, 'BillableUnits * 5.0 * {discountToMultiplyVal}');
                assert.include(estimates.content.query, 'ScopeKey, Workload, MonthlyAverage, ResourcesPerUnit, BillableUnits, MonthlyCost, Status');
                assert.isTrue(estimates.content.showExportToExcel);
                assert.isNotEmpty(estimates.content.noDataMessage);
                assert.includeDeepMembers(estimates.content.gridSettings.labelSettings, [
                    { columnId: 'MonthlyCost', label: 'Monthly cost (USD)' },
                    { columnId: 'MonthlyAverage', label: 'Monthly avg. resources' }
                ]);
            });

            it('keeps detailed guidance optional and documents separation from the original totals', () => {
                const guidance = details.content.items.find(item => item.name === 'Serverless forecast guidance');
                const help = options.content.parameters.find(item => item.name === 'serverlessHelp');
                assert.strictEqual(help.value, '0');
                assert.deepEqual(JSON.parse(help.jsonData), [
                    { value: '0', label: 'Hide', selected: true },
                    { value: '1', label: 'Show' }
                ]);
                assert.deepEqual(guidance.conditionalVisibility, {
                    parameterName: 'serverlessHelp', comparison: 'isEqualTo', value: '1'
                });
                assert.include(guidance.content.json, 'not added to the original CSPM columns or Grand total');
                assert.include(guidance.content.json, 'missing telemetry is unknown');
            });
        });
    }
});
