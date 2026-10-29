const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');
const Validator = require('jsonschema').Validator;

describe('Validating Defender CSPM settings and findings...', () => {
    const workbookPath = path.join('Workbooks', 'Azure Security Center', 'Defender CSPM', 'DefenderCSPM.workbook');
    const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));
    const components = [
        ['AgentlessVmScanning', 'Agentless scanning for machines'],
        ['AgentlessDiscoveryForKubernetes', 'Kubernetes API access'],
        ['ContainerRegistriesVulnerabilityAssessments', 'Registry access'],
        ['SensitiveDataDiscovery', 'Sensitive data discovery'],
        ['EntraPermissionsManagement', 'Cloud Infrastructure and Entitlements Management (CIEM)'],
        ['ApiPosture', 'API Security Posture Management'],
        ['AgentlessServerlessPosture', 'Serverless protection'],
        ['ServerlessContainers', 'Serverless containers']
    ];
    const item = name => {
        const result = workbook.items.find(candidate => candidate.name === name);
        assert.exists(result, `Missing workbook item: ${name}`);
        return result;
    };
    const settings = item('settings_monitoring').content.query;
    const newTables = [
        'mdc_plans_enabled', 'settings_monitoring', 'extension_inventory',
        'findings_counts', 'all_recommendations', 'detailed_findings'
    ];

    it('matches the workbook JSON schema', () => {
        const schema = JSON.parse(fs.readFileSync(path.join('schema', 'workbook.json'), 'utf8'));
        const validation = new Validator().validate(workbook, schema);
        assert.deepEqual(validation.errors.map(error => error.stack), []);
    });

    it('keeps the original tabs and adds a distinct findings tab', () => {
        assert.deepEqual(item('tab').content.links.map(link => link.subTarget), [
            'main', 'attackpath', 'assessment', 'findings'
        ]);
        assert.deepEqual(item('wkbk_main_param').content.parameters.map(parameter => parameter.name), ['subscriptions']);
        ['query - 9', 'query - 24', 'query - 25', 'num_of_attack_path',
            'attack_path_resource_type', 'attack_path_risk_categories', 'attack_path_list_summary',
            'query - 30', 'query - 2', 'query - 31', 'pie_recommedation_mitigation_status',
            'query - 3', 'recommendation_with_gov_rule', 'recommendation_without_gov_rule',
            'query - 4', 'query - 32'].forEach(name => item(name));
    });

    it('has unique item names and parameter IDs', () => {
        const names = workbook.items.map(entry => entry.name);
        assert.equal(new Set(names).size, names.length);
        const parameterIds = workbook.items.filter(entry => entry.type === 9)
            .flatMap(entry => entry.content.parameters.map(parameter => parameter.id));
        assert.equal(new Set(parameterIds).size, parameterIds.length);
    });

    it('defines exactly the eight components in Settings page scroll order', () => {
        const match = settings.match(/\| extend component = dynamic\((\[[^\r\n]+\])\)/);
        assert.isNotNull(match);
        const definitions = JSON.parse(match[1]);
        assert.deepEqual(definitions.map(component => [component.name, component.label]), components);
        assert.deepEqual(definitions.map(component => component.order), [1, 2, 3, 4, 5, 6, 7, 8]);
        assert.include(settings, 'componentOrder = toint(component["order"]), Component = tostring(component["label"]), ExtensionName = tostring(component["name"])');
        assert.include(settings, '| order by componentOrder asc, subscriptionName asc, subscriptionId asc');
    });

    it('keeps subscriptions with no plan or extensions in a left-joined baseline', () => {
        assert.match(settings, /^resourcecontainers\n\| where type =~ "microsoft.resources\/subscriptions"/);
        assert.include(settings, '| join kind=leftouter (');
        assert.include(settings, '| mv-expand extension = iff(array_length(extensions) > 0, extensions, dynamic([{}]))');
        assert.include(settings, 'by subscriptionId, subscriptionName, componentOrder, Component, ExtensionName, pricingTier');
        assert.notMatch(settings, /\| where .*matched/);
    });

    it('uses only subscription-level CloudPosture settings, not shared-plan or resource overrides', () => {
        assert.include(settings, '| where name =~ "CloudPosture"');
        assert.include(settings, '| where id =~ strcat("/subscriptions/", subscriptionId, "/providers/Microsoft.Security/pricings/", name)');
        assert.notInclude(settings, 'VirtualMachines');
        assert.notInclude(settings, 'StorageAccounts');
        assert.notInclude(settings, '"Containers"');
    });

    it('recognizes explicit, case-normalized booleans and preserves unknown or conflicting states', () => {
        assert.include(settings, 'rawState = tolower(tostring(extension.isEnabled))');
        assert.include(settings, 'enabled = countif(matched and rawState == "true")');
        assert.include(settings, 'disabled = countif(matched and rawState == "false")');
        assert.include(settings, 'unknown = countif(matched and rawState !in ("true", "false"))');
        const status = settings.substring(settings.indexOf('| extend Status = case('));
        const branches = [
            'pricingTier =~ "Free", "Plan disabled"',
            'pricingTier !~ "Standard", "Plan not reported"',
            'failed > 0, "Operation failed"',
            'operationUnknown > 0, "Operation not successful"',
            'enabled > 0 and disabled > 0, "Conflicting"',
            'reported == 0, "Not reported"',
            'unknown > 0, "Unknown"',
            'enabled > 0, "Enabled"',
            'disabled > 0, "Disabled"'
        ];
        let previous = -1;
        branches.forEach(branch => {
            const position = status.indexOf(branch);
            assert.isAbove(position, previous, `Missing or misordered status branch: ${branch}`);
            previous = position;
        });
    });

    it('preserves exclusions and enablement operation failures without painting missing data green', () => {
        assert.include(settings, 'failed = countif(matched and extension.operationStatus.code =~ "Failed")');
        assert.include(settings, 'operationUnknown = countif(matched and isnotempty(tostring(extension.operationStatus.code)) and tostring(extension.operationStatus.code) !in~ ("Succeeded", "Failed"))');
        assert.include(settings, 'Configuration = make_set(iff(matched, extension.additionalExtensionProperties, dynamic(null)))');
        assert.include(settings, 'OperationStatus = make_set(iff(matched, extension.operationStatus, dynamic(null)))');
        const thresholds = item('settings_monitoring').content.gridSettings.formatters
            .find(formatter => formatter.columnMatch === 'Status').formatOptions.thresholdsGrid;
        assert.deepEqual(thresholds.filter(threshold => threshold.representation === 'green')
            .map(threshold => threshold.thresholdValue), ['Enabled']);
        assert.equal(thresholds.find(threshold => threshold.operator === 'Default').representation, 'orange');
    });

    it('reports all pricing plans and does not infer enablement from a stale subplan', () => {
        const query = item('mdc_plans_enabled').content.query;
        assert.include(query, 'Status = case(PricingTier =~ "Standard", "Enabled", PricingTier =~ "Free", "Disabled", "Not reported")');
        assert.include(query, 'SubPlan = tostring(properties.subPlan)');
        assert.include(query, 'ResourceCoverage = tostring(properties.resourcesCoverageStatus)');
        assert.notMatch(query, /\| where name/);
    });

    it('retains every reported extension and its source plan in the diagnostic inventory', () => {
        const query = item('extension_inventory').content.query;
        assert.include(query, 'dynamic([{}])');
        assert.include(query, 'Plan = name');
        assert.include(query, 'ReportedEnablement');
        assert.include(query, 'extension.additionalExtensionProperties');
        assert.include(query, 'extension.operationStatus');
        assert.notMatch(query, /\| where .*extension/i);
        assert.notMatch(query, /\| where name/);
    });

    it('uses the same escaped server-side search for findings counts and both detail tables', () => {
        const parameter = item('findings_search').content.parameters.find(entry => entry.name === 'FindingSearch');
        assert.equal(parameter.type, 1);
        assert.equal(parameter.value, '');
        const status = item('findings_search').content.parameters.find(entry => entry.name === 'FindingStatus');
        assert.equal(status.type, 2);
        assert.equal(status.value, 'All');
        assert.deepEqual(JSON.parse(status.jsonData).map(option => option.value), [
            'All', 'Unhealthy', 'Healthy', 'NotApplicable', 'Other'
        ]);
        ['findings_counts', 'all_recommendations', 'detailed_findings'].forEach(name => {
            const query = item(name).content.query;
            assert.include(query, '| where isempty("{FindingSearch:escape}") or id contains "{FindingSearch:escape}" or tostring(properties) contains "{FindingSearch:escape}"');
            assert.include(query, '| where "{FindingStatus:escape}" == "All" or tostring(properties.status.code) =~ "{FindingStatus:escape}"');
            assert.include(query, 'or ("{FindingStatus:escape}" == "Other" and tostring(properties.status.code) !in~ ("Unhealthy", "Healthy", "NotApplicable"))');
            assert.notInclude(query, '{FindingSearch}');
            assert.notInclude(query, '{FindingStatus}');
        });
    });

    it('shows complete server-side counts separately from the capped detail tables', () => {
        const query = item('findings_counts').content.query;
        assert.include(query, '"microsoft.security/assessments", "microsoft.security/assessments/subassessments"');
        assert.include(query, 'Total = count()');
        assert.include(query, 'OtherOrUnknown = countif');
        assert.include(query, 'DisplayLimit = 1000');
        assert.include(query, 'Total > 1000');
        assert.notInclude(query, '| take');
        ['all_recommendations', 'detailed_findings'].forEach(name => {
            assert.match(item(name).content.query, /\| take 1000$/);
        });
    });

    it('does not drop newer findings, non-Azure findings, or unknown assessment states', () => {
        ['all_recommendations', 'detailed_findings'].forEach(name => {
            const query = item(name).content.query;
            const whereClauses = query.split('\n').filter(line => line.startsWith('| where'));
            assert.lengthOf(whereClauses, 3);
            assert.include(query, '"Not reported"');
            assert.include(query, 'properties.resourceDetails.AwsResourceId');
            assert.include(query, 'properties.resourceDetails.GcpResourceId');
            assert.include(query, 'ResourceDetails = properties.resourceDetails');
            assert.include(query, 'AdditionalData = properties.additionalData');
            assert.notMatch(query, /where.*(displayName|name in|severity|AwsResourceId|GcpResourceId)/i);
        });
        assert.include(item('all_recommendations').content.query, 'Risk = properties.risk');
        assert.include(item('detailed_findings').content.query, 'RecommendationId = extract("(?i)/assessments/([^/]+)/subassessments/", 1, id)');
    });

    newTables.forEach(name => {
        it(`${name} is full-width, subscription-scoped, searchable, and explicit about empty results`, () => {
            const table = item(name);
            assert.isUndefined(table.customWidth);
            assert.equal(table.content.queryType, 1);
            assert.equal(table.content.resourceType, 'microsoft.resourcegraph/resources');
            assert.deepEqual(table.content.crossComponentResources, ['{subscriptions}']);
            assert.isTrue(table.content.gridSettings.filter);
            assert.equal(table.content.gridSettings.rowLimit, 1000);
            assert.isNotEmpty(table.content.title);
            assert.isNotEmpty(table.content.noDataMessage);
            assert.isNotEmpty(table.content.gridSettings.labelSettings);
            assert.isTrue(table.content.gridSettings.labelSettings.every(label => label.columnId && label.label));
        });
    });

    it('removes obsolete hidden pricing logic and explains scope, dependency, and completeness limits', () => {
        ['dcspm_config', 'recommended_extensions', 'query - 17',
            'query - 18', 'query - 19', 'query - 20', 'query - 21'].forEach(name => {
            assert.notInclude(workbook.items.map(entry => entry.name), name);
        });
        const guidance = item('settings_monitoring_guidance').content.json;
        assert.include(guidance, 'CloudPosture only');
        assert.include(guidance, '125 subscriptions');
        assert.include(guidance, '**Sensitive data discovery**');
        assert.include(guidance, '**Registry access**');
        const findings = item('all_findings_guidance').content.json;
        assert.include(findings, '1,000 rows');
        assert.include(findings, 'not universally through Resource Graph');
        assert.include(findings, 'do not guess feature ownership');
    });
});
