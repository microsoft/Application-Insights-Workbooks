const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');
const Validator = require('jsonschema').Validator;

const root = path.resolve(__dirname, '..');
const templateId = 'Workbooks/Azure Security Center/PHP2SHELL';
const workbook = JSON.parse(fs.readFileSync(path.join(root, templateId, 'PHP2SHELL.workbook'), 'utf8'));
const gallery = JSON.parse(fs.readFileSync(path.join(root, 'gallery/workbook/Azure Security Center.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema/workbook.json'), 'utf8'));

function flatten(items, ancestors = []) {
    return items.flatMap(item => [
        { item, ancestors },
        ...flatten(item.content.items || [], [...ancestors, item])
    ]);
}

const nodes = flatten(workbook.items);
const queries = nodes.filter(node => node.item.type === 3);
const parameters = nodes.flatMap(node => node.item.content.parameters || []);
const text = nodes.filter(node => node.item.type === 1).map(node => node.item.content.json).join('\n');
const query = name => {
    const node = queries.find(node => node.item.name === name);
    assert.exists(node, `Missing query ${name}`);
    return node.item.content.query;
};

describe('PHP2SHELL workbook', () => {
    it('conforms to the workbook JSON schema', () => {
        const result = new Validator().validate(workbook, schema);
        assert.deepEqual(result.errors.map(error => error.stack), []);
    });

    it('registers once in the same community gallery immediately after Log4j', () => {
        const entries = gallery.categories.flatMap(category => category.templates);
        assert.lengthOf(entries.filter(entry => entry.id === templateId), 1);
        const community = gallery.categories.find(category => category.id === 'Community');
        const index = community.templates.findIndex(entry => entry.id === templateId);
        assert.isAbove(index, 0);
        assert.equal(community.templates[index - 1].id, 'Workbooks/Azure Security Center/Log4j');
        assert.isString(community.templates[index].author);
        assert.isFalse(community.templates[index].isPreview || false);
        assert.deepEqual(fs.readdirSync(path.join(root, templateId)).filter(file => file.endsWith('.workbook')), ['PHP2SHELL.workbook']);
    });

    it('uses unique meaningful step names and parameter IDs with localized labels', () => {
        const names = nodes.map(node => node.item.name);
        assert.equal(new Set(names.map(name => name.replace(/[\W_]/g, ''))).size, names.length);
        assert.isTrue(names.every(name => name && !/^query -|^text -/i.test(name)));
        assert.equal(new Set(parameters.map(parameter => parameter.id)).size, parameters.length);
        for (const parameter of parameters) {
            assert.isNotEmpty(parameter.label, parameter.name);
            assert.isNotEmpty(parameter.description, parameter.name);
        }
        for (const { item } of queries) {
            assert.isNotEmpty(item.content.title, item.name);
            assert.isNotEmpty(item.content.noDataMessage, item.name);
            assert.isAbove(item.content.gridSettings.labelSettings.length, 0, item.name);
        }
    });

    it('keeps advisories, findings links and prerequisites visible before all tabs', () => {
        const headline = workbook.items[0];
        const prerequisites = workbook.items[1];
        assert.equal(headline.type, 1);
        assert.notExists(headline.conditionalVisibility);
        assert.notExists(prerequisites.conditionalVisibility);
        assert.include(headline.content.json, 'techcommunity.microsoft.com/blog/azurenetworksecurityblog/addressing-php2shell');
        assert.include(headline.content.json, 'RecommendationsBlade');
        assert.include(headline.content.json, 'CVE-2026-109618');
        assert.include(headline.content.json, 'CVE-2026-109619');
        for (const required of ['Defender CSPM', 'Defender for Servers Plan 2', 'Registry access', 'DevOps', 'permissions', 'not ingested']) {
            assert.include(prerequisites.content.json, required);
        }
        assert.match(prerequisites.content.json, /not all foundational DevOps inventory and findings/);
        assert.match(prerequisites.content.json, /Missing tables and access errors remain visible/);
    });

    it('defaults to organization overview with seven environment tabs and a workload filter', () => {
        const tabs = workbook.items.find(item => item.name === 'Organization and environment tabs').content.links;
        assert.lengthOf(tabs, 7);
        assert.equal(tabs[0].subTarget, 'All');
        assert.deepEqual(
            tabs.map(tab => tab.subTarget).sort(),
            ['All', 'Azure', 'AWS', 'GCP', 'Hybrid', 'DevOps', 'Other'].sort()
        );
        for (const tab of tabs) {
            assert.equal(tab.cellValue, 'Environment');
            assert.equal(tab.linkTarget, 'parameter');
        }
        assert.equal(parameters.find(parameter => parameter.name === 'Environment').value, 'All');
        assert.equal(parameters.find(parameter => parameter.name === 'Workload').value, 'All');
        const sections = nodes.find(node => node.item.name === 'Additional investigation section tabs').item.content.links;
        assert.deepEqual(sections.map(tab => tab.subTarget), ['Machines', 'Containers', 'Exposure', 'DevOps', 'Hunting', 'Response']);
    });

    it('explicitly scopes ARG assessments/resources while allowing tenant-only CVE metadata', () => {
        const subscription = parameters.find(parameter => parameter.name === 'Subscription');
        assert.equal(subscription.type, 6);
        assert.isTrue(subscription.multiSelect);
        for (const { item } of queries.filter(node => node.item.content.queryType === 1)) {
            assert.include(item.content.query, '| where subscriptionId in~ ({Subscription:subid})', item.name);
            assert.deepEqual(
                item.content.crossComponentResources,
                [item.name === 'Unified PHP2SHELL findings' ? 'value::tenant' : '{Subscription}'],
                item.name
            );
        }
        const workspace = parameters.find(parameter => parameter.name === 'Workspace');
        assert.equal(workspace.queryType, 1);
        assert.deepEqual(workspace.crossComponentResources, ['{Subscription}']);
        assert.include(workspace.query, '| where subscriptionId in~ ({Subscription:subid})');
        assert.deepEqual(workspace.value, []);
        assert.notExists(workbook.fallbackResourceIds);
        assert.notMatch(JSON.stringify(workbook), /\/subscriptions\/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
        assert.notMatch(JSON.stringify(workbook), /fromTemplateId|fallbackResourceIds/);
    });

    it('matches exact advisory identifiers after expanding individual CVE details', () => {
        for (const name of [
            'PHP2SHELL organization summary',
            'Unified PHP2SHELL findings'
        ]) {
            const kql = query(name);
            assert.include(kql, "type =~ 'microsoft.security/assessments'");
            assert.include(kql, 'properties.additionalData.CvesDetails');
            assert.match(kql, /mv-expand CveDetail = CvesDetails limit 2000/);
            assert.include(kql, "where CVE in~ ('CVE-2026-109618', 'CVE-2026-109619')");
            assert.include(kql, "properties.status.code) =~ 'Unhealthy'");
            assert.include(kql, "recommendationCategory in~ ('SoftwareUpdate', 'ServiceUpgrade')");
            assert.notMatch(kql, /assessmentKey\s*==/);
            assert.notMatch(kql, /pricingTier|CloudPosture|where .*RiskLevel|AllPHP|AllLog4j/);
        }
    });

    it('uses the current recommendation schema without retired grouped queries or scanner double-counting', () => {
        assert.notInclude(queries.map(node => node.item.content.query).join('\n'), 'microsoft.security/assessments/subassessments');
        assert.include(text, 'deprecated on 2026-07-31');
        assert.include(query('PHP2SHELL organization summary'), 'dcount(AssessmentId)');
        assert.notInclude(query('Unified PHP2SHELL findings'), 'mv-expand Scanner');
        assert.include(text, 'not scanner totals');
    });

    it('left-joins deduplicated tenant CVE metadata without dropping unmatched findings', () => {
        const kql = query('Unified PHP2SHELL findings');
        const lookup = kql.split("type =~ 'microsoft.security/cvedetails'")[1].split(') on CVE')[0];
        assert.include(kql, 'join kind=leftouter');
        assert.include(lookup, 'arg_max(MetadataRank, properties) by CVE');
        assert.notInclude(lookup, 'subscriptionId');
        assert.include(kql, 'Unknown - not reported');
        assert.include(kql, 'Not visible - verify tenant/read access');
        assert.notMatch(kql, /where isnotempty\(MetadataCVE\)|join kind=inner/);
    });

    it('preserves subscriptions and empty extension arrays and distinguishes missing from disabled', () => {
        const kql = query('Reported Defender plan component coverage');
        assert.match(kql, /^resourcecontainers/);
        assert.include(kql, 'join kind=leftouter');
        assert.include(kql, "id matches regex '(?i)^/subscriptions/[^/]+/providers/microsoft.security/pricings/[^/]+$'");
        assert.include(kql, "iff(isempty(Tier), 'Not reported', Tier)");
        assert.include(kql, "iff(array_length(Extensions) > 0, Extensions, dynamic([{}]))");
        assert.include(kql, "tostring(Extension.isEnabled) =~ 'true', 'Enabled'");
        assert.include(kql, "tostring(Extension.isEnabled) =~ 'false', 'Disabled', 'Not reported'");
        assert.notMatch(kql, /where .*pricingTier.*Standard|where .*isEnabled/);
    });

    it('uses one classifier and environment/workload filter contract across recommendation surfaces', () => {
        const names = ['PHP2SHELL organization summary', 'Unified PHP2SHELL findings', 'Environment posture evidence'];
        const classifiers = names.map(name => query(name).match(/\| extend Environment = [^\n]+\n\| extend Workload = [^\n]+/)[0]);
        assert.equal(new Set(classifiers).size, 1);
        for (const name of names) {
            const kql = query(name);
            assert.include(kql, "'{Environment}' == 'All' or Environment == '{Environment}'");
            assert.include(kql, "'{Workload}' == 'All' or Workload == '{Workload}'");
            assert.include(kql, 'properties.cloudMetadata.provider');
            assert.include(kql, 'properties.environmentName');
            assert.notMatch(kql, /Environment\s*=\s*subscriptionId|Environment\s*=\s*resourceGroup/);
        }
    });

    it('keeps native AWS/GCP Arc provenance ahead of Hybrid and unresolved connectors out of Azure', () => {
        const kql = query('Unified PHP2SHELL findings');
        const classifier = kql.match(/\| extend Environment = ([^\n]+)/)[1];
        assert.isBelow(classifier.indexOf("ArcCloudProvider =~ 'AWS'"), classifier.indexOf("'Hybrid'"));
        assert.isBelow(classifier.indexOf("ArcCloudProvider =~ 'GCP'"), classifier.indexOf("'Hybrid'"));
        assert.include(classifier, "CloudSource =~ 'Azure' and (isempty(ConnectorId) or ConnectorPlatform =~ 'Azure')");
        assert.include(classifier, "'DockerHub', 'JFrog'");
        assert.include(classifier, "AssessmentId matches regex '(?i)/providers/microsoft[.]security/securityconnectors/[^/]+/devops/'");
        assert.match(classifier, /'Azure', 'Other'\)$/);
        assert.include(text, 'not assumed to be native Azure');
    });

    it('discovers connectors without requiring findings or offerings and exports names rather than payloads', () => {
        const kql = query('Environment connector inventory');
        assert.match(kql, /^resources/);
        assert.include(kql, "'microsoft.security/securityconnectors'");
        assert.notInclude(kql, 'securityresources');
        assert.include(kql, 'dynamic([{}])');
        assert.include(kql, 'Offering.offeringType');
        assert.notMatch(kql, /where .*offering|where .*health|where .*scan|where .*Workload/);
        assert.include(kql, 'AnchorSubscription');
        assert.include(kql, 'health, complete scope and scan completion not verified');
    });

    describe('provider-qualified DevOps hierarchy', () => {
        const pattern = query('Unified PHP2SHELL findings').match(/AssessmentId matches regex '([^']+)'/)[1];
        const matcher = new RegExp(pattern.replace(/^\(\?i\)/, ''), 'i');

        it('shares the structural predicate across classification, repository views and workload exclusions', () => {
            assert.notMatch(queries.map(node => node.item.content.query).join('\n'), /(?:AssessmentId|id) !?contains '\/devops\/'/);
            assert.include(query('DevOps PHP keyword candidates'), `where id matches regex '${pattern}'`);
            assert.include(query('DevOps hardening metadata without secret contents'), `where id matches regex '${pattern}'`);
            assert.include(query('Exposure identity and secrets recommendation context'), `where not(id matches regex '${pattern}')`);
        });

        for (const [label, resource, expected] of [
            ['resource group named devops', '/subscriptions/s/resourceGroups/devops/providers/Microsoft.Compute/virtualMachines/app/providers/Microsoft.Security/assessments/a', false],
            ['VM named devops', '/subscriptions/s/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/devops/providers/Microsoft.Security/assessments/a', false],
            ['Arc machine named devops', '/subscriptions/s/resourceGroups/rg/providers/Microsoft.HybridCompute/machines/devops/providers/Microsoft.Security/assessments/a', false],
            ['connector named devops without a DevOps hierarchy', '/subscriptions/s/resourceGroups/rg/providers/Microsoft.Security/securityConnectors/devops/providers/Microsoft.Security/assessments/a', false],
            ['unrelated path segment', '/subscriptions/s/resourceGroups/rg/custom/devops/default', false],
            ['GitHub connector hierarchy', '/subscriptions/s/resourceGroups/rg/providers/Microsoft.Security/securityConnectors/code/devops/default/githubOwners/org/repos/repo/providers/Microsoft.Security/assessments/a', true],
            ['case-variant hierarchy', '/subscriptions/s/resourceGroups/rg/PROVIDERS/MICROSOFT.SECURITY/SECURITYCONNECTORS/code/DEVOPS/default/githubOwners/org/repos/repo', true],
            ['repository and resource group both named devops', '/subscriptions/s/resourceGroups/devops/providers/Microsoft.Security/securityConnectors/code/devops/default/githubOwners/org/repos/devops', true]
        ]) {
            it(`handles ${label}`, () => assert.equal(matcher.test(resource), expected));
        }
    });

    it('retains disconnected Arc inventory and distinguishes inventory gaps from PHP evidence', () => {
        const kql = query('Machine inventory and connection gaps');
        assert.include(kql, 'properties.cloudMetadata.provider');
        assert.include(kql, 'properties.status');
        assert.notMatch(kql, /where .*Connected|where .*Disconnected/);
        assert.include(kql, 'microsoft.security/softwareinventories');
        assert.include(kql, 'properties.nodeResourceGroup');
        assert.include(kql, 'where isempty(IsKubernetesNode)');
        assert.include(kql, 'not proof of a complete PHP scan');
    });

    it('retains apps, slots and unknown runtimes as candidates rather than asserting vulnerability', () => {
        const kql = query('App Service and slot runtime candidates');
        assert.include(kql, "'microsoft.web/sites/slots'");
        assert.include(kql, 'Not reported in Resource Graph');
        assert.include(kql, 'runtime not established');
        assert.notMatch(kql, /\| where .*PHPVersion|\| where .*LinuxStack/);
        assert.include(query('Configured serverless container image candidates'), "dynamic([{}])");
        assert.include(text, 'An App Service major/minor stack setting is not the effective patched PHP build');
    });

    it('includes DevOps repository platforms and keeps runtime and SBOM evidence separate', () => {
        const kql = query('DevOps connected repository inventory');
        for (const platform of ['azuredevopsorgs/projects/repos', 'githubowners/repos', 'gitlabgroups/projects']) {
            assert.include(kql, platform);
        }
        assert.include(query('DevOps hardening metadata without secret contents'), "'ExposedSecrets'");
        assert.include(query('DevOps hardening metadata without secret contents'), "'IacVulnerabilities'");
        assert.include(text, 'Composer');
        assert.include(text, 'does not establish the running PHP interpreter/version');
        assert.include(text, 'query-software-bill-of-materials');
        assert.include(text, 'not a promise of PHP source-code scanning');
    });

    it('retains all CVE resource types and reported CSPM risk rather than dropping serverless findings', () => {
        const kql = query('Unified PHP2SHELL findings');
        assert.include(kql, 'properties.risk.level');
        assert.include(kql, 'properties.risk.riskFactors');
        assert.include(kql, 'properties.risk.attackPathsReferences');
        assert.notMatch(kql, /\| where .*ResourceType|\| where .*\/devops\//);
        assert.include(kql, 'properties.resourceDetails.AzureResourceId');
        assert.include(kql, 'properties.resourceDetails.nativeResourceId');
    });

    it('reads both Front Door object and Application Gateway array custom-rule shapes', () => {
        const kql = query('WAF policy configuration candidates');
        assert.include(kql, 'iff(isnotnull(properties.customRules.rules), properties.customRules.rules, properties.customRules)');
        assert.include(kql, "iff(isnull(array_length(CustomRules)), 'Not reported'");
        assert.notInclude(kql, 'microsoft.serviceNetworking/trafficControllers/webApplicationFirewallPolicies');
    });

    describe('Front Door diagnostic category matching', () => {
        const filter = query('Front Door WAF request match context').match(/Category (=~|==) '([^']+)'/);
        for (const [category, expected] of [
            ['FrontDoorWebApplicationFirewallLog', true],
            ['FrontdoorWebApplicationFirewallLog', true],
            ['ApplicationGatewayFirewallLog', false]
        ]) {
            it(`evaluates ${category} as ${expected}`, () => {
                const actual = filter[1] === '=~' ? category.toLowerCase() === filter[2].toLowerCase() : category === filter[2];
                assert.equal(actual, expected);
            });
        }
    });

    it('does not execute optional logs until an explicit source and workspace are chosen', () => {
        assert.equal(parameters.find(parameter => parameter.name === 'ShowDetails').value, 'Off');
        const source = parameters.find(parameter => parameter.name === 'LogSource');
        assert.equal(source.value, 'None');
        const choices = JSON.parse(source.jsonData).filter(choice => choice.value !== 'None');
        assert.lengthOf(choices, 10);
        const logs = queries.filter(node => node.item.content.queryType === 0);
        assert.lengthOf(logs, 11);
        for (const { item, ancestors } of logs) {
            assert.deepEqual(item.content.crossComponentResources, ['{Workspace}']);
            assert.equal(item.content.timeContextFromParameter, 'TimeRange');
            assert.include(item.content.query, '{TimeRange}');
            assert.equal(item.conditionalVisibility.parameterName, 'LogSource');
            assert.isTrue(ancestors.some(parent =>
                parent.conditionalVisibility?.parameterName === 'ShowDetails' &&
                parent.conditionalVisibility.value === 'On'
            ), item.name);
        }
        for (const choice of choices) {
            assert.lengthOf(logs.filter(node =>
                node.item.conditionalVisibility.comparison === 'isEqualTo' &&
                node.item.conditionalVisibility.value === choice.value
            ), 1, choice.value);
        }
        assert.notMatch(logs.map(node => node.item.content.query).join('\n'), /isfuzzy|best_effort|datatable|catch/i);
        assert.include(text, 'do **not** inherit the Environment or Recommendation workload filters');
    });

    describe('version evidence regression', () => {
        const kql = query('Unified PHP2SHELL findings');

        it('supports assessment, MDVM and alternate-scanner versions without blank empty-array fallbacks', () => {
            assert.include(kql, 'properties.additionalData.ScannersDetails');
            assert.include(kql, 'ScannersDetails.mdvm.DetectedSoftwareVersions');
            assert.include(kql, 'FirstScanner.DetectedSoftwareVersions');
            assert.include(kql, 'FirstScanner.FixedVersion');
            assert.include(kql, "in ('', '[]', '{}', 'null')");
            assert.include(kql, 'DetectedVersionSource');
            assert.include(kql, 'FixedVersionSource');
            assert.include(kql, 'bag_keys(ScannersDetails)[0]');
        });

        it('resolves per-CVE fixes only after expansion and before assessment/scanner fallbacks', () => {
            assert.isBelow(kql.indexOf('mv-expand CveDetail'), kql.indexOf('CveDetail.FixedVersion'));
            assert.include(kql, "FixedVersion = coalesce(CveFixed, AssessmentFixed, MdvmFixed, FirstScannerFixed, 'Not reported')");
        });

        const precedence = kql.match(/FixedVersion = coalesce\(([^)]+)\)/)[1].split(', ');
        const resolve = evidence => {
            for (const token of precedence) {
                if (token.startsWith("'")) return token.slice(1, -1);
                if (evidence[token] !== undefined && evidence[token] !== null && evidence[token] !== '') return evidence[token];
            }
            throw new Error('Published fixed-version expression has no fallback');
        };
        for (const [label, evidence, expected] of [
            ['per-CVE beats shared assessment', { CveFixed: '8.3.36', AssessmentFixed: '8.3.35', MdvmFixed: '8.3.34' }, '8.3.36'],
            ['assessment before scanner', { AssessmentFixed: '8.4.27', MdvmFixed: '8.4.26' }, '8.4.27'],
            ['MDVM-only evidence', { MdvmFixed: '8.2.35' }, '8.2.35'],
            ['alternate-scanner-only evidence', { FirstScannerFixed: '8.5.12' }, '8.5.12'],
            ['empty normalized evidence stays unknown', { CveFixed: '', AssessmentFixed: '', MdvmFixed: '', FirstScannerFixed: '' }, 'Not reported']
        ]) {
            it(`evaluates the published coalesce order: ${label}`, () => assert.equal(resolve(evidence), expected));
        }
    });

    it('uses Azure workload subscription scope without mislabeling unmapped or endpoint evidence', () => {
        for (const name of [
            'App Service HTTP burst heuristic', 'App Service console error heuristic',
            'Application Gateway WAF match context', 'Front Door WAF request match context',
            'Container worker error heuristic', 'Routed Syslog worker failure heuristic'
        ]) {
            assert.include(query(name), '_SubscriptionId in~ ({Subscription:subid})');
        }
        const alerts = query('Collected security alert candidates');
        assert.include(alerts, 'isempty(ResourceSubscription) or ResourceSubscription in~ ({Subscription:subid})');
        assert.include(alerts, 'Unmapped - workspace scope only');
        for (const name of [
            'Endpoint web worker child process heuristic',
            'Endpoint direct worker network heuristic',
            'Endpoint PHP family file write heuristic'
        ]) {
            const node = queries.find(node => node.item.name === name);
            assert.include(node.item.content.title, 'workspace/device-scoped');
            assert.notInclude(node.item.content.query, '_SubscriptionId');
        }
    });

    for (const name of [
        'Endpoint web worker child process heuristic',
        'Endpoint direct worker network heuristic',
        'Endpoint PHP family file write heuristic'
    ]) {
        it(`binds the Log Analytics time schema for ${name}`, () => {
            const kql = query(name);
            assert.include(kql, 'where TimeGenerated {TimeRange}');
            assert.include(kql, 'project Timestamp = TimeGenerated,');
            assert.notInclude(kql, 'where Timestamp');
            assert.include(kql, 'order by Timestamp desc');
        });
    }

    it('keeps TVM inventory in copyable Defender XDR queries, not Log Analytics', () => {
        const executed = queries.map(node => node.item.content.query).join('\n');
        assert.notMatch(executed, /DeviceTvmSoftware/);
        assert.include(text, 'DeviceTvmSoftwareInventory');
        assert.include(text, 'DeviceTvmSoftwareVulnerabilities');
        assert.include(text, 'do not run against Log Analytics');
        assert.include(text, 'not ingested by the standard Microsoft Sentinel Defender XDR connector');
    });

    it('does not expose raw secrets, cookies, request bodies or process command lines', () => {
        for (const { item } of queries) {
            const projection = item.content.query.split(/\|\s*project\s+/).at(-1);
            assert.notMatch(projection, /\b(?:Cookie|SetCookie|ProcessCommandLine|InitiatingProcessCommandLine|DetailedData|SecretValue)\b/i, item.name);
            assert.notMatch(item.content.query, /\|\s*project[^\n]*\bproperties\s*(?:,|\n|$)/, item.name);
        }
        const devops = query('DevOps hardening metadata without secret contents');
        assert.notInclude(devops, 'properties.status.description');
        assert.include(text, 'Secret contents, raw scanner payloads');
    });

    it('does not manufacture WAF response-hit or automatic patch effectiveness claims', () => {
        assert.include(text, 'does not generate WAF log entries or hit counts');
        assert.include(text, 'Application Gateway v2 response-header rewrite');
        assert.include(text, 'effective web SAPI');
        assert.include(text, 'all workers');
        for (const version of ['8.2.35', '8.3.36', '8.4.27', '8.5.12']) {
            assert.include(text, version);
        }
        assert.notMatch(queries.map(node => node.item.content.query).join('\n'), /SoftwareVersion\s*[<>]|PHPVersion\s*[<>]/);
        assert.include(text, 'This is a read-only investigation template');
    });

    describe('HTTP hunt threshold regression', () => {
        const kql = query('App Service HTTP burst heuristic');
        const countMatch = kql.match(/\bErrors\s*(>=|>)\s*(\d+)/);
        const sizeMatch = kql.match(/\bLargestRequestBytes\s*(>=|>)\s*(\d+)/);
        const binMatch = kql.match(/bin\(TimeGenerated,\s*(\d+)m\)/);
        const compare = (value, match) => match[1] === '>=' ? value >= Number(match[2]) : value > Number(match[2]);
        const matches = (errors, bytes) => compare(errors, countMatch) && compare(bytes, sizeMatch);

        it('specifies POST, inclusive 5xx status, a five-minute bin, and exact count/size boundaries', () => {
            assert.include(kql, "CsMethod =~ 'POST' and ScStatus between (500 .. 599)");
            assert.equal(Number(binMatch[1]), 5);
            assert.deepEqual(countMatch.slice(1), ['>=', '5']);
            assert.deepEqual(sizeMatch.slice(1), ['>', '100000']);
        });

        for (const [errors, bytes, expected] of [
            [4, 100001, false],
            [5, 100000, false],
            [5, 100001, true],
            [6, 100001, true],
            [0, 1000000, false]
        ]) {
            it(`evaluates the published predicate at ${errors} errors / ${bytes} bytes as ${expected}`, () => {
                assert.equal(matches(errors, bytes), expected);
            });
        }
    });
});
