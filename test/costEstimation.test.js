const assert = require('chai').assert;
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
        discount: 'discount', discountHelper: 'discountToMultiply', originalDiscount: '',
        serversSelection: 'AzureP1P2', serversPlan: 'azureServersPlanVal'
    },
    {
        name: 'tenantGroup', mode: '1', originalItems: 22,
        api: 'azureapiplanstenant', notes: 'text - 6 - Copy',
        discount: 'discounttenant', discountHelper: 'discounttomultiplytenant', originalDiscount: '5',
        serversSelection: 'AzureP1P2tenant', serversPlan: 'azureServersPlanValTenant'
    }
];

function discountFactor(parameter, value) {
    const selected = parameter.criteriaData.find(({ criteriaContext: criteria }) => {
        switch (criteria.operator) {
            case 'is Empty': return value === '' || value === null || value === undefined;
            case '=': return String(value) === criteria.rightVal;
            case 'isNotNull': return value !== null && value !== undefined;
            case 'Default': return true;
            default: assert.fail('Unexpected discount operator: ' + criteria.operator);
        }
    }).criteriaContext;
    if (selected.resultValType === 'static') return Number(selected.resultVal);
    assert.strictEqual(selected.resultValType, 'expression');
    assert.strictEqual(selected.resultVal, '(100-{discountVal})/100.0');
    const expression = selected.resultVal.replace('{discountVal}', String(value));
    assert.match(expression, /^\(100-\d+\)\/100\.0$/);
    return vm.runInNewContext(expression, Object.create(null), { timeout: 100 });
}

function queryStrings(value) {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, child]) =>
        key === 'query' && typeof child === 'string' ? [child] : queryStrings(child));
}

describe('Cost estimation workbook', () => {
    it('preserves original content apart from the discount hardening, Servers corrections, and concise guidance', () => {
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
            const discount = group.content.items.find(item => item.name === scope.discount)
                .content.parameters.find(parameter => parameter.name === 'discountVal');
            discount.value = scope.originalDiscount;
            delete discount.description;
            const multiplier = group.content.items.find(item => item.name === scope.discountHelper)
                .content.parameters.find(parameter => parameter.name === 'discountToMultiplyVal');
            multiplier.criteriaData.shift();
            for (const { criteriaContext: criteria } of multiplier.criteriaData) {
                if (criteria.operator === '=') criteria.operator = '==';
            }
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
            const discountItem = group.content.items.find(item => item.name === scope.discount);
            const discount = discountItem.content.parameters.find(parameter => parameter.name === 'discountVal');
            const multiplierItem = group.content.items.find(item => item.name === scope.discountHelper);
            const multiplier = multiplierItem.content.parameters.find(parameter =>
                parameter.name === 'discountToMultiplyVal');

            it('defaults the planning discount to zero without requiring agreement-pricing access', () => {
                assert.strictEqual(discount.value, '0');
                assert.notProperty(discount, 'query');
                assert.notProperty(discountItem.content, 'query');
                assert.include(discount.description, 'Optional manual planning discount');
                assert.include(discount.description, 'Defaults to 0%');
                assert.include(discount.description, 'no tenant-wide or subscription-wide percentage is inferred');
            });

            it('uses the full-price multiplier for zero, cleared, null, and uninitialized discounts', () => {
                assert.strictEqual(multiplier.criteriaData[0].criteriaContext.operator, 'is Empty');
                assert.strictEqual(multiplier.criteriaData[0].criteriaContext.resultVal, '1.0');
                for (const value of ['0', 0, '', null, undefined]) {
                    assert.strictEqual(discountFactor(multiplier, value), 1);
                }
                for (const price of [0, 0.625, 5, 15, 50, 7000]) {
                    assert.strictEqual(price * discountFactor(multiplier, '0'), price);
                    assert.strictEqual(price * discountFactor(multiplier, ''), price);
                }
            });

            it('evaluates every whole-number discount from zero to one hundred correctly', () => {
                for (let percentage = 0; percentage <= 100; percentage++) {
                    const factor = discountFactor(multiplier, String(percentage));
                    assert.strictEqual(factor, (100 - percentage) / 100);
                    assert.isAtLeast(factor, 0);
                    assert.isAtMost(factor, 1);
                    assert.isTrue(Number.isFinite(factor));
                }
                assert.strictEqual(100 * discountFactor(multiplier, '20'), 80);
                assert.strictEqual(7000 * discountFactor(multiplier, '100'), 0);
            });

            it('keeps invalid percentages blocked while allowing the cleared zero-discount case', () => {
                const rule = discount.typeSettings.paramValidationRules[0];
                assert.isTrue(rule.match);
                const validation = new RegExp(rule.regExp);
                for (const value of ['', '0', '20', '99', '100']) assert.match(value, validation);
                for (const value of ['-1', '101', '20.5', '20%', 'abc', ' ', 'NaN', 'Infinity']) {
                    assert.notMatch(value, validation);
                }
            });

            it('uses schema-valid discount controls and guards for every criterion', () => {
                const parameterSchema = {
                    $id: workbookSchema.$id,
                    $ref: '#/definitions/parameter',
                    definitions: workbookSchema.definitions
                };
                assert.deepEqual(new Validator().validate(discountItem, parameterSchema).errors, []);
                assert.deepEqual(new Validator().validate(multiplierItem, parameterSchema).errors, []);
                for (const criteria of multiplier.criteriaData) {
                    assert.deepEqual(new Validator().validate(criteria, {
                        ...parameterSchema, $ref: '#/definitions/criteriaDataItem'
                    }).errors, []);
                }
            });

            it('substitutes a numeric full-price factor into queries and merge expressions at zero discount', () => {
                const queries = queryStrings(group);
                assert.isNotEmpty(queries);
                for (const query of queries) assert.notInclude(query, '{discountVal}');
                const discounted = queries.filter(query => query.includes('{discountToMultiplyVal}'));
                assert.isNotEmpty(discounted);
                for (const value of ['0', '']) {
                    const literal = discountFactor(multiplier, value).toFixed(1);
                    assert.strictEqual(literal, '1.0');
                    for (const query of discounted) {
                        const expanded = query.replaceAll('{discountToMultiplyVal}', literal);
                        assert.notInclude(expanded, '{discountToMultiplyVal}');
                        assert.notMatch(expanded, /\b(?:NaN|Infinity|undefined)\b/);
                        if (expanded.trimStart().startsWith('{')) assert.isObject(JSON.parse(expanded));
                    }
                }
            });

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
