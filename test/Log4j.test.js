const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');
const Validator = require('jsonschema').Validator;

const workbookPath = path.join(__dirname, '..', 'Workbooks', 'Azure Security Center', 'Log4j', 'Log4j.workbook');
const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));

function flattenItems(items) {
    return items.flatMap(item => [item, ...flattenItems(item.content.items || [])]);
}

const items = flattenItems(workbook.items);
const queries = items.filter(item => item.type === 3);
const parameters = items.flatMap(item => item.content.parameters || []);
const findingQueries = queries.filter(item => item.content.query.includes('CvesDetails'));
const environments = ['All', 'Azure', 'AWS', 'GCP', 'Hybrid', 'DevOps', 'Other'];
const cveFamily = ['CVE-2021-44228', 'CVE-2021-45046', 'CVE-2021-45105', 'CVE-2021-44832'];
const itemByName = name => items.find(item => item.name === name);

function assessmentClassification(query) {
    return query.slice(query.indexOf('| extend Resource ='), query.indexOf("| where '{Environment}'"));
}

describe('Log4j workbook', () => {
    it('validates against the workbook schema and gallery template conventions', () => {
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'workbook.json'), 'utf8'));
        const result = new Validator().validate(workbook, schema);
        assert.deepEqual(result.errors.map(error => error.stack), []);
        assert.equal(workbook.version, 'Notebook/1.0');
        assert.notProperty(workbook, 'fromTemplateId');
        assert.deepEqual(workbook.fallbackResourceIds, []);
        assert.notMatch(JSON.stringify(workbook), /\/subscriptions\/[a-f0-9-]{36}/i);
    });

    it('has unique item names and parameter/link identifiers', () => {
        const names = items.map(item => item.name);
        const ids = [
            ...parameters.map(parameter => parameter.id),
            ...items.flatMap(item => (item.content.links || []).map(link => link.id))
        ];
        assert.equal(new Set(names).size, names.length);
        assert.equal(new Set(ids).size, ids.length);
    });

    it('defaults to the organization overview and navigates by environment rather than scanner or license', () => {
        const environment = parameters.find(parameter => parameter.name === 'Environment');
        const tabs = itemByName('EnvironmentTabs').content.links;
        assert.equal(environment.value, 'All');
        assert.deepEqual(tabs.map(tab => tab.subTarget), environments);
        assert.equal(tabs[0].linkLabel, 'Organization overview');
        tabs.forEach(tab => {
            assert.equal(tab.cellValue, environment.name);
            assert.equal(tab.linkTarget, 'parameter');
            assert.notMatch(tab.linkLabel, /TVM|Qualys|CSPM|Machines|Containers|Serverless|Runtime/i);
            assert.isTrue(items.some(item => item.conditionalVisibility
                && item.conditionalVisibility.parameterName === 'Environment'
                && item.conditionalVisibility.value === tab.subTarget));
        });
        assert.notInclude(parameters.map(parameter => parameter.name), 'Section');
    });

    it('uses only declared query and visibility parameters', () => {
        const names = new Set(parameters.map(parameter => parameter.name));
        items.forEach(item => {
            if (item.conditionalVisibility) {
                assert.isTrue(names.has(item.conditionalVisibility.parameterName), item.name);
            }
        });
        [...queries.map(item => item.content), ...parameters].forEach(content => {
            const text = JSON.stringify([content.query, content.crossComponentResources, content.timeContextFromParameter]);
            for (const match of text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)(?::[^}]+)?\}/g)) {
                assert.isTrue(names.has(match[1]), `Undeclared query parameter ${match[1]}`);
            }
        });
    });

    it('explicitly filters every ARG query and workspace discovery to selected subscriptions', () => {
        const argContents = [
            ...queries.filter(item => item.content.queryType === 1).map(item => item.content),
            ...parameters.filter(parameter => parameter.queryType === 1)
        ];
        assert.lengthOf(argContents, 7);
        argContents.forEach(content => {
            assert.include(content.query, 'where subscriptionId in~ ({Subscription:subid})');
            assert.notInclude(JSON.stringify(content.crossComponentResources), 'value::all');
        });
    });

    it('uses one consistent environment/workload classification across summary, findings, and posture evidence', () => {
        const contents = ['Log4jSummary', 'UnifiedFindings', 'PostureEvidence'].map(name => itemByName(name).content);
        contents.forEach(content => {
            assert.equal(assessmentClassification(content.query), assessmentClassification(contents[0].query));
            assert.include(content.query, "'{Environment}' == 'All' or Environment == '{Environment}'");
            assert.include(content.query, "'{Workload}' == 'All' or Workload == '{Workload}'");
        });
        assert.equal(queries.filter(item => item.name === 'UnifiedFindings').length, 1);
        const workload = parameters.find(parameter => parameter.name === 'Workload');
        assert.equal(workload.value, 'All');
        assert.sameMembers(JSON.parse(workload.jsonData).map(option => option.value),
            ['All', 'Machines', 'Containers', 'Serverless', 'DevOps', 'Other']);
    });

    it('prioritizes native AWS/GCP provenance over Arc representation', () => {
        const classifier = assessmentClassification(itemByName('UnifiedFindings').content.query);
        const environmentCase = classifier.slice(classifier.indexOf('| extend Environment ='));
        assert.include(classifier, "type in~ ('microsoft.hybridcompute/machines', 'microsoft.security/securityconnectors')");
        assert.include(classifier, 'properties.cloudMetadata.provider');
        assert.include(classifier, "ArcCloudProvider =~ 'AWS'");
        assert.include(classifier, "ArcCloudProvider =~ 'GCP'");
        assert.isBelow(environmentCase.indexOf("ArcCloudProvider =~ 'AWS'"),
            environmentCase.indexOf("ResourceType startswith 'microsoft.hybridcompute/'"));
        assert.isBelow(environmentCase.indexOf("ArcCloudProvider =~ 'GCP'"),
            environmentCase.indexOf("ResourceType startswith 'microsoft.hybridcompute/'"));
        assert.include(classifier, "ResourceType startswith 'microsoft.awsconnector/'");
        assert.include(classifier, "ResourceType startswith 'microsoft.gcpconnector/'");
        assert.include(classifier, "CloudSource in~ ('AzureDevOps', 'Github', 'GitLab')");
    });

    it('keeps unclassified environments and workloads instead of assigning the Azure hosting subscription as provenance', () => {
        const classifier = assessmentClassification(itemByName('UnifiedFindings').content.query);
        assert.include(classifier, "CloudSource =~ 'Azure' and (isempty(ConnectorId) or ConnectorPlatform =~ 'Azure'), 'Azure', 'Other')");
        assert.include(classifier, "'Machines', 'Other')");
        assert.notMatch(classifier, /Resource (?:startswith|contains) '\/subscriptions\//);
        assert.notMatch(itemByName('UnifiedFindings').content.query, /where Environment != 'Other'/);
        assert.include(itemByName('OtherGuidance').content.json, 'unclassified');
    });

    it('uses connector platform metadata without treating external or unresolved connectors as native Azure', () => {
        const classifier = assessmentClassification(itemByName('UnifiedFindings').content.query);
        assert.include(classifier, "iff(ResourceType startswith 'microsoft.hybridcompute/', Resource, ConnectorId)");
        assert.include(classifier, 'ConnectorPlatform = tostring(properties.environmentName)');
        assert.include(classifier, "ConnectorPlatform in~ ('AzureDevOps', 'Github', 'GitLab')");
        assert.include(classifier, "ConnectorPlatform =~ 'AWS'");
        assert.include(classifier, "ConnectorPlatform =~ 'GCP'");
        assert.include(classifier, "ConnectorPlatform in~ ('DockerHub', 'JFrog'), 'Other'");
        assert.equal((classifier.match(/join kind=leftouter/g) || []).length, 1);
    });

    it('uses current individual recommendations and consistent Log4j scope without a plan/license gate', () => {
        assert.lengthOf(findingQueries, 2);
        findingQueries.forEach(item => {
            const query = item.content.query;
            assert.include(query, "type =~ 'microsoft.security/assessments'");
            assert.include(query, "('SoftwareUpdate', 'ServiceUpgrade')");
            assert.include(query, "tostring(properties.status.code) == 'Unhealthy'");
            assert.include(query, 'properties.additionalData.CvesDetails');
            assert.include(query, 'CveDetail.CveId');
            assert.include(query, 'mv-expand CveDetail = CvesDetails limit 2000');
            cveFamily.forEach(cve => assert.include(query, cve));
            assert.include(query, "'{FindingScope}' == 'AllLog4j' and Software has_any ('log4j', 'log4j2')");
            assert.notInclude(query, "Software contains 'log4j'");
            assert.include(query, 'where isnotempty(CVE)');
            assert.notInclude(query, 'assessments/subassessments');
            assert.notInclude(query, 'pricingTier');
            assert.notInclude(query, 'PlanRecords');
        });
        const scope = parameters.find(parameter => parameter.name === 'FindingScope');
        assert.equal(scope.value, 'Log4Shell');
        assert.sameMembers(JSON.parse(scope.jsonData).map(option => option.value), ['Log4Shell', 'AllLog4j']);
    });

    it('keeps the broader posture evidence separate from the Log4j-specific filter', () => {
        const query = itemByName('PostureEvidence').content.query;
        assert.notInclude(query, 'CvesDetails');
        assert.notInclude(query, '{FindingScope}');
        assert.notInclude(query, "where tostring(properties.status.code) == 'Unhealthy'");
        assert.include(query, "countif(Status == 'Unhealthy')");
        assert.include(query, "countif(Status == 'Healthy')");
        assert.include(query, 'MissingStatus');
        assert.include(itemByName('PostureEvidence').content.title, 'not Log4j verdicts');
    });

    it('keeps global CVE metadata tenant-scoped and preserves missing metadata and Arc provenance', () => {
        const content = itemByName('UnifiedFindings').content;
        assert.equal(content.resourceType, 'microsoft.resources/tenants');
        assert.deepEqual(content.crossComponentResources, ['value::tenant']);
        assert.equal((content.query.match(/join kind=leftouter/g) || []).length, 2);
        assert.notInclude(content.query, 'join kind=inner');
        assert.include(content.query, 'Unknown - CVE detail not visible');
        const metadataSide = content.query.split("type =~ 'microsoft.security/cvedetails'")[1].split(') on CVE')[0];
        assert.notInclude(metadataSide, 'subscriptionId');
    });

    it('retains individual image/package, repository, connector, and native source evidence', () => {
        const query = itemByName('UnifiedFindings').content.query;
        ['ImageUri', 'Repository', 'Software', 'DetectedVersions', 'FixedVersion', 'WorkloadDetails', 'AssessmentId',
            'Environment', 'Workload', 'CloudSource', 'ArcCloudProvider', 'ConnectorPlatform', 'ConnectorId']
            .forEach(column => assert.include(query, column));
        assert.notInclude(query, 'summarize');
        const projection = query.split('\n').filter(line => line.startsWith('| project ')).pop();
        const columns = projection.slice('| project '.length).split(',').map(column => column.trim().split(/\s*=/)[0]);
        assert.equal(new Set(columns).size, columns.length);
        ['CVE', 'AssessmentId', 'Subscription'].forEach(column => assert.include(columns, column));
    });

    it('preserves resource navigation', () => {
        [['UnifiedFindings', 'Resource'], ['MachineInventoryCoverage', 'MachineId']].forEach(([name, column]) => {
            const formatter = itemByName(name).content.gridSettings.formatters.find(entry => entry.columnMatch === column);
            assert.equal(formatter.formatter, 13);
            assert.equal(formatter.formatOptions.linkTarget, 'Resource');
        });
    });

    it('keeps missing risk distinct from low risk or zero paths', () => {
        const query = itemByName('UnifiedFindings').content.query;
        assert.include(query, 'properties.risk.level');
        assert.include(query, 'properties.risk.riskFactors');
        assert.include(query, 'properties.risk.attackPathsReferences');
        assert.include(query, 'Not evaluated / no visible context');
        assert.notMatch(query, /iff\(is(?:null|empty)\([^)]*AttackPath[^)]*\),\s*0/i);
    });

    it('starts plan coverage from visible subscriptions and distinguishes reported Free/Standard from unknown', () => {
        const query = itemByName('PlanCoverage').content.query;
        assert.match(query, /^resourcecontainers/);
        assert.include(query, "'microsoft.resources/subscriptions'");
        assert.include(query, 'join kind=leftouter');
        assert.include(query, "ReportedCSPMTier =~ 'Free', 'Foundational / Free reported'");
        assert.include(query, "ReportedCSPMTier =~ 'Standard', 'Paid Defender CSPM reported'");
        assert.include(query, 'Unknown - verify native plan management');
        assert.deepEqual(itemByName('OrganizationCoverage').conditionalVisibility, {
            parameterName: 'Environment', comparison: 'isEqualTo', value: 'All'
        });
    });

    it('discovers connectors independently of finding volume and retains external/unknown platforms', () => {
        const query = itemByName('ConnectorInventory').content.query;
        assert.include(query, "'microsoft.security/securityconnectors'");
        assert.include(query, 'properties.environmentName');
        assert.include(query, 'properties.hierarchyIdentifier');
        assert.include(query, 'properties.offerings');
        assert.include(query, "('Github', 'AzureDevOps', 'GitLab')");
        assert.include(query, "'Azure', 'Other')");
        assert.include(query, "'{Environment}' == 'All' or Environment == '{Environment}'");
        assert.include(query, 'health and scan completion not verified');
        assert.notInclude(query, 'CvesDetails');
        assert.notInclude(query, 'mv-expand');
        assert.notInclude(query, '{FindingScope}');
        assert.notInclude(query, '{Workload}');
    });

    it('retains disconnected Arc connection gaps and does not present inventory as a complete scan', () => {
        const query = itemByName('MachineInventoryCoverage').content.query;
        assert.include(query, "'microsoft.security/softwareinventories'");
        assert.include(query, "'microsoft.containerservice/managedclusters'");
        assert.include(query, 'where isempty(IsKubernetesNode)');
        assert.notInclude(query, "properties.status) == 'Connected'");
        assert.include(query, 'ArcConnectionStatus');
        assert.include(query, 'properties.cloudMetadata.provider');
        assert.include(query, 'Missing - investigate scan coverage');
        assert.include(query, 'Present - not proof of a complete Log4j scan');
        assert.equal((query.match(/join kind=leftouter/g) || []).length, 2);
    });

    it('requires explicit runtime opt-in, workspace selection, and a time range', () => {
        const workspace = parameters.find(parameter => parameter.name === 'Workspace');
        const runtime = itemByName('RuntimeAlerts');
        assert.equal(parameters.find(parameter => parameter.name === 'ShowHelp').value, 'Off');
        assert.deepEqual(itemByName('GuidanceAndInvestigation').conditionalVisibility, {
            parameterName: 'ShowHelp', comparison: 'isEqualTo', value: 'On'
        });
        assert.equal(workspace.value, '');
        assert.isFalse(workspace.isRequired);
        assert.deepEqual(runtime.conditionalVisibility, {
            parameterName: 'Workspace', comparison: 'isNotEqualTo', value: ''
        });
        assert.equal(runtime.content.queryType, 0);
        assert.equal(runtime.content.resourceType, 'microsoft.operationalinsights/workspaces');
        assert.deepEqual(runtime.content.crossComponentResources, ['{Workspace}']);
        assert.equal(runtime.content.timeContextFromParameter, 'TimeRange');
        assert.include(runtime.content.query, 'SecurityAlert\n| where TimeGenerated {TimeRange}');
        ['Subscription', 'Environment', 'Workload', 'FindingScope']
            .forEach(name => assert.notInclude(runtime.content.query, `{${name}`));
        assert.notInclude(runtime.content.query, 'isfuzzy');
        assert.notInclude(runtime.content.query, 'datatable');
        assert.include(runtime.content.title, 'selected workspace/time only');
    });

    it('does not present an empty result or missing license/connection evidence as proof of safety', () => {
        queries.forEach(item => {
            assert.isNotEmpty(item.content.noDataMessage, item.name);
            assert.match(item.content.noDataMessage, /verify|check/i, item.name);
            assert.notMatch(item.content.noDataMessage, /^No unhealthy .* found$/i, item.name);
        });
        const text = items.filter(item => item.type === 1).map(item => item.content.json).join('\n');
        assert.include(text, 'An empty result does not mean an environment is safe');
        assert.include(text, 'Agentless code scanning (Preview)');
        assert.include(text, 'Linux-only');
        assert.include(text, 'posture-only');
        assert.include(text, 'public network access disabled');
        assert.include(text, 'Do not broaden network access');
        assert.include(text, 'not a guaranteed census of the entire organization');
    });
});
