const assert = require('chai').assert;
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Validator = require('jsonschema').Validator;

const workbook = JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'Workbooks', 'Azure Security Center', 'Cost Estimation', 'CostEstimation.workbook'
), 'utf8'));
const workbookSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'workbook.json'), 'utf8'));
const optionalGroupName = 'Optional serverless CSPM estimates';
const controlsName = 'CSPM serverless controls';
const scopes = [
    {
        name: 'subscriptionGroup', mode: '0', originalItems: 23,
        api: 'azureapiplans', notes: 'text - 6',
        serversSelection: 'AzureP1P2', serversPlan: 'azureServersPlanVal'
    },
    {
        name: 'tenantGroup', mode: '1', originalItems: 22,
        api: 'azureapiplanstenant', notes: 'text - 6 - Copy',
        serversSelection: 'AzureP1P2tenant', serversPlan: 'azureServersPlanValTenant'
    }
];

describe('Cost estimation workbook', () => {
    it('preserves original content apart from the Servers corrections and concise serverless guidance', () => {
        const baseline = JSON.parse(JSON.stringify(workbook));
        for (const scope of scopes) {
            const group = baseline.items.find(item => item.name === scope.name);
            group.content.items = group.content.items.filter(item =>
                item.name !== optionalGroupName && item.name !== controlsName);
            const notes = group.content.items.find(item => item.name === scope.notes);
            notes.content.json = notes.content.json
                .replace(/\r\n\r\n\* ###### \*\*Serverless (?:protection|containers)\*\*[^\r\n]*/g, '')
                .replace('with base billing for Servers, Databases and Storages',
                    'but billing only applies for Servers, Databases and Storages');
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
            const controls = group.content.items.find(item => item.name === controlsName);
            const optional = group.content.items.find(item => item.name === optionalGroupName);
            const conditions = optional.content.items.find(item => item.name === 'Serverless estimate conditions');
            const details = optional.content.items.find(item => item.name === 'Serverless estimate details');
            const options = details.content.items.find(item => item.name === 'Serverless forecast inputs');
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

            it('places both switches immediately below Azure API Plan', () => {
                const apiIndex = group.content.items.findIndex(item => item.name === scope.api);
                assert.strictEqual(group.content.items[apiIndex + 1], controls);
                assert.strictEqual(controls.content.style, 'above');
                assert.deepEqual(controls.content.parameters.map(parameter => parameter.name),
                    ['serverlessProtection', 'serverlessContainers']);
                assert.deepEqual(controls.conditionalVisibility, {
                    parameterName: 'istenantlevel', comparison: 'isEqualTo', value: scope.mode
                });
            });

            it('keeps estimates after the original visuals and reveals them through the component switches', () => {
                assert.lengthOf(group.content.items, scope.originalItems + 2);
                assert.strictEqual(group.content.items[group.content.items.length - 1], optional);
                assert.strictEqual(optional.content.exportParameters, false);
                assert.deepEqual(optional.conditionalVisibility, {
                    parameterName: 'istenantlevel',
                    comparison: 'isEqualTo',
                    value: scope.mode
                });
                assert.strictEqual(conditions.content.style, 'pills');
                assert.isTrue(conditions.content.parameters.every(parameter => parameter.isHiddenWhenLocked));
                assert.deepEqual(details.conditionalVisibility, {
                    parameterName: 'serverlessComponentsIncluded',
                    comparison: 'isEqualTo',
                    value: '1'
                });
            });

            it('keeps both components independently excluded by default', () => {
                for (const name of ['serverlessProtection', 'serverlessContainers']) {
                    const parameter = controls.content.parameters.find(item => item.name === name);
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

            it('removes the JSON editor while retaining hidden usage configuration and missing-input safeguards', () => {
                const usage = options.content.parameters.find(item => item.name === 'serverlessUsage');
                assert.isTrue(usage.isHiddenWhenLocked);
                assert.notProperty(usage, 'label');
                assert.notProperty(usage, 'typeSettings');
                assert.notProperty(usage, 'isRequired');
                assert.strictEqual(usage.value, '{}');
                assert.isTrue(options.content.parameters.every(parameter => parameter.isHiddenWhenLocked));
                assert.notInclude(JSON.stringify(group), 'Monthly averages (JSON)');
                assert.include(warning.content.json, 'workbook configuration');
                assert.include(warning.content.json, 'not missing telemetry');
                for (const parameter of controls.content.parameters) {
                    assert.include(parameter.description, 'Usage comes from the workbook configuration');
                }
            });

            it('describes assets and subscription or account component enablement in both tooltips', () => {
                const protection = controls.content.parameters.find(item => item.name === 'serverlessProtection');
                const containers = controls.content.parameters.find(item => item.name === 'serverlessContainers');
                for (const parameter of [protection, containers]) {
                    assert.include(parameter.description, 'Defender CSPM and its ' + parameter.label + ' component are enabled');
                    assert.include(parameter.description, 'subscriptions or accounts');
                    assert.include(parameter.description, 'Environment settings');
                    assert.include(parameter.description, 'does not enable the component');
                }
                for (const asset of ['Azure Function Apps', 'Azure Web Apps', 'AWS Lambda functions']) {
                    assert.include(protection.description, asset);
                }
                for (const asset of ['Azure Container Apps (ACA)', 'Azure Container Instances (ACI)', 'ECS on AWS Fargate']) {
                    assert.include(containers.description, asset);
                }
                assert.include(containers.description, 'running containers');
                assert.include(containers.description, 'Registry access');
            });

            it('requires a selected CSPM plan and at least one included component to reveal forecasts', () => {
                const selected = conditions.content.parameters.find(item => item.name === 'serverlessCspmSelected');
                const included = conditions.content.parameters.find(item => item.name === 'serverlessComponentsIncluded');
                for (const parameter of [selected, included]) {
                    for (const { criteriaContext: criteria } of parameter.criteriaData) {
                        assert.include(['=', 'Default'], criteria.operator);
                    }
                }
                const evaluate = (parameter, values) => parameter.criteriaData.find(({ criteriaContext: criteria }) =>
                    criteria.operator === 'Default' || values[criteria.leftOperand] === criteria.rightVal
                ).criteriaContext.resultVal;
                for (const azure of ['false', 'true']) {
                    for (const aws of ['false', 'true']) {
                        for (const protection of ['0', '1']) {
                            for (const containers of ['0', '1']) {
                                const cspm = evaluate(selected, { azureIsDcspm: azure, awsIsDcspm: aws });
                                assert.strictEqual(cspm, azure === 'true' || aws === 'true' ? '1' : '0');
                                assert.strictEqual(evaluate(included, {
                                    serverlessCspmSelected: cspm,
                                    serverlessProtection: protection,
                                    serverlessContainers: containers
                                }), cspm === '1' && (protection === '1' || containers === '1') ? '1' : '0');
                            }
                        }
                    }
                }
            });

            it('uses schema-valid criteria for every hidden condition, not just the first array item', () => {
                for (const parameter of conditions.content.parameters) {
                    for (const criteria of parameter.criteriaData) {
                        const schema = {
                            $id: workbookSchema.$id,
                            $ref: '#/definitions/criteriaDataItem',
                            definitions: workbookSchema.definitions
                        };
                        assert.deepEqual(new Validator().validate(criteria, schema).errors, []);
                    }
                }
            });

            it('never makes the original visuals depend on optional inputs', () => {
                const originalItems = group.content.items.filter(item => item !== optional && item !== controls);
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
                const selected = conditions.content.parameters.find(item => item.name === 'serverlessCspmSelected');
                assert.isTrue(selected.criteriaData.filter(item => item.criteriaContext.operator !== 'Default')
                    .every(item => item.criteriaContext.operator === '='));
                assert.include(warning.content.json, 'A component cost stays blank until all its inputs are valid');
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

            it('replaces the removed sections with two concise bullets immediately after the CSPM bullet', () => {
                const notes = group.content.items.find(item => item.name === scope.notes).content.json;
                const bullets = notes.split('\r\n\r\n');
                const base = bullets.findIndex(bullet => bullet.startsWith('* ###### Microsoft Defender CSPM'));
                assert.isAtLeast(base, 0);
                assert.match(bullets[base + 1], /^\* ###### \*\*Serverless protection\*\*/);
                assert.match(bullets[base + 2], /^\* ###### \*\*Serverless containers\*\*/);
                for (const bullet of bullets.slice(base + 1, base + 3)) {
                    assert.isBelow(bullet.length, 750);
                    assert.include(bullet, 'Defender CSPM and its Serverless');
                    assert.include(bullet, '**Include in estimate**');
                    assert.include(bullet, '$5/month');
                    assert.include(bullet, 'selected discount');
                }
                assert.include(bullets[base + 1], '8 resources');
                assert.include(bullets[base + 2], '2 containers');
                const serialized = JSON.stringify(group);
                for (const removed of [
                    'Serverless forecast overview', 'Serverless forecast guidance',
                    '### Optional serverless CSPM estimates', 'Input and pricing help',
                    'serverlessHelp', 'showServerlessEstimates'
                ]) {
                    assert.notInclude(serialized, removed);
                }
                const usage = options.content.parameters.find(item => item.name === 'serverlessUsage');
                assert.notInclude(usage.description, 'guidance below');
                assert.include(usage.description, '"functions":40');
                assert.include(usage.description, '"fargate":20');
                assert.include(usage.description, 'not missing telemetry');
            });
        });
    }
});
