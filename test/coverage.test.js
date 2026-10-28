const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

describe('Validating Defender CSPM capability coverage...', () => {
    const workbookPath = path.join('Workbooks', 'Azure Security Center', 'Coverage', 'Coverage.workbook');
    const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));
    const azure = workbook.items.find(item => item.name === 'Azure');
    const cspm = azure.content.items.find(item => item.name === 'queryAzureDetailedCSPM');
    const capabilities = [
        ['AgentlessVmScanning', 'Agentless scanning for machines'],
        ['AgentlessDiscoveryForKubernetes', 'Kubernetes API access'],
        ['ContainerRegistriesVulnerabilityAssessments', 'Registry access'],
        ['SensitiveDataDiscovery', 'Sensitive data discovery'],
        ['EntraPermissionsManagement', 'Cloud Infrastructure Entitlement Management (CIEM)'],
        ['ApiPosture', 'API Security Posture Management'],
        ['AgentlessServerlessPosture', 'Serverless protection'],
        ['ServerlessContainers', 'Serverless containers']
    ];

    it('projects all eight Azure CSPM components in portal top-to-bottom order', () => {
        const projection = cspm.content.query.split('| project subscriptionId,')[1];
        assert.isString(projection, 'The CSPM table must retain its subscription column');
        const columns = [...projection.matchAll(/(\w+)\s*=\s*extensions\.(\w+)/g)];
        assert.deepEqual(columns.map(match => match[1]), capabilities.map(([name]) => name));
        columns.forEach(match => assert.equal(match[1], match[2], 'Each column must use its own extension setting'));
    });

    it('keeps the subscription first and component labels in portal order', () => {
        assert.deepEqual(cspm.content.gridSettings.labelSettings.map(item => item.columnId),
            ['subscriptionId', ...capabilities.map(([name]) => name)]);
    });

    it('keeps the subscription first and component formatters in portal order', () => {
        assert.deepEqual(cspm.content.gridSettings.formatters.map(item => item.columnMatch),
            ['subscriptionId', ...capabilities.map(([name]) => name)]);
    });

    it('retains enabled subscriptions with empty or unreported extensions', () => {
        assert.include(cspm.content.query, 'name =~ "CloudPosture"');
        assert.include(cspm.content.query, '| where pricingTier == "Standard"');
        assert.include(cspm.content.query,
            '| mv-expand extensionSettings = iff(array_length(properties.extensions) > 0, properties.extensions, dynamic([{}]))');
        assert.include(cspm.content.query, '| summarize extensions = make_bag(planSet) by subscriptionId');
    });

    it('normalizes string and boolean settings without inferring enabled or disabled', () => {
        assert.include(cspm.content.query,
            '| extend planSet = pack(tostring(extensionSettings.name), tolower(tostring(extensionSettings.isEnabled)))');
        assert.notMatch(cspm.content.query, /coalesce\(|tobool\(/);
    });

    it('preserves subscription scope and the detailed-coverage filters', () => {
        assert.equal(cspm.content.queryType, 1);
        assert.equal(cspm.content.resourceType, 'microsoft.resourcegraph/resources');
        assert.deepEqual(cspm.content.crossComponentResources, ['{Subscriptions}']);
        assert.deepEqual(cspm.conditionalVisibilities, [
            { parameterName: 'planName', comparison: 'isEqualTo', value: 'DCSPM' },
            { parameterName: 'detailedCoverage', comparison: 'isEqualTo', value: 'Yes' }
        ]);
    });

    capabilities.forEach(([columnId, label]) => {
        describe(label, () => {
            it('has a unique localized display label and status formatter', () => {
                const labels = cspm.content.gridSettings.labelSettings.filter(item => item.columnId === columnId);
                assert.lengthOf(labels, 1);
                assert.equal(labels[0].label, label);
                assert.lengthOf(cspm.content.gridSettings.formatters.filter(item => item.columnMatch === columnId), 1);
            });

            it('links to the subscription component settings', () => {
                const formatter = cspm.content.gridSettings.formatters.find(item => item.columnMatch === columnId);
                assert.exists(formatter);
                assert.equal(formatter.formatter, 18);
                assert.equal(formatter.formatOptions.linkColumn, 'subscriptionId');
                assert.equal(formatter.formatOptions.linkTarget, 'OpenBlade');
                const context = formatter.formatOptions.bladeOpenContext;
                assert.equal(context.bladeName, 'DataCollectionBladeV2');
                assert.equal(context.extensionName, 'Microsoft_Azure_Security');
                assert.includeDeepMembers(context.bladeParameters, [
                    { name: 'subscriptionId', source: 'column', value: 'subscriptionId' }
                ]);
            });

            [
                ['true', 'Enabled', 'lightBlue'],
                ['false', 'Disabled', 'redBright'],
                [null, 'Not reported', 'gray'],
                [undefined, 'Not reported', 'gray'],
                ['', 'Not reported', 'gray'],
                ['unrecognized', 'Not reported', 'gray']
            ].forEach(([value, text, color]) => {
                it(`renders ${String(value)} as ${text}`, () => {
                    const formatter = cspm.content.gridSettings.formatters.find(item => item.columnMatch === columnId);
                    assert.exists(formatter);
                    const rules = formatter.formatOptions.thresholdsGrid;
                    const rule = rules.find(item => item.operator === '==' && item.thresholdValue === value)
                        || rules.find(item => item.operator === 'Default');
                    assert.exists(rule);
                    assert.equal(rule.text, text);
                    assert.equal(rule.representation, color);
                });
            });
        });
    });
});
