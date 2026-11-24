const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('GitHub Defender CSPM coverage', () => {
    const workbook = JSON.parse(fs.readFileSync(path.join(
        'Workbooks', 'Azure Security Center', 'Coverage', 'Coverage.workbook'
    ), 'utf8'));
    const root = name => workbook.items.find(item => item.name === name);
    const group = root('GitHub');
    const get = name => group.content.items.find(item => item.name === name);

    it('adds a GitHub tab without showing unrelated multicloud plans', () => {
        assert(root('menu').content.links.some(link =>
            link.linkLabel === 'GitHub' && link.subTarget === 'GitHub'));
        assert.deepStrictEqual(group.conditionalVisibility, {
            parameterName: 'environment', comparison: 'isEqualTo', value: 'GitHub'
        });
        assert(root('planNames multicloud').conditionalVisibilities.some(value =>
            value.parameterName === 'environment' &&
            value.comparison === 'isNotEqualTo' && value.value === 'GitHub'));
    });

    it('joins GitHub connectors to their DevOps configuration and preserves unreported plans', () => {
        const content = get('queryGitHub').content;
        assert.deepStrictEqual(content.crossComponentResources, ['{Subscriptions}']);
        assert.match(content.query, /environmentName\) =~ "Github"/);
        assert.match(content.query, /environmentType\) =~ "GithubScope"/);
        assert.match(content.query, /join kind=leftouter/);
        assert.match(content.query, /securityresources[\s\S]*microsoft\.security\/securityconnectors\/devops/);
        assert.match(content.query, /CapabilityName == "dcspm_enabled"/);
        assert.doesNotMatch(content.query, /CspmMonitorGithub/i);
        assert.match(content.query, /coalesce\(CapabilityUnknown, 0\) == 0/);
        assert.match(content.query, /"Not reported"/);
        const relative = get('queryGitHubRelative').content.query;
        assert.match(relative, /CSPMReported > 0/);
        assert.match(relative, /Connectors - CSPMReported/);
    });

    it('shows scanner and scope settings in portal order', () => {
        const content = get('queryGitHubDetailed').content;
        assert.deepStrictEqual(content.gridSettings.labelSettings.map(value => value.label), [
            'Connector', 'Connector resource', 'Subscription ID', 'Agentless code scanning',
            'ESLint', 'Bandit', 'Template Analyzer', 'Checkov', 'Trivy',
            'Scope selection', 'Reported scanner IDs'
        ]);
        assert.match(content.query, /properties\.agentlessConfiguration\.agentlessEnabled/);
        assert.match(content.query, /properties\.agentlessConfiguration\.scanners/);
        assert.match(content.query, /properties\.agentlessConfiguration\.agentlessAutoDiscovery/);
        assert.match(content.query, /properties\.agentlessConfiguration\.inventoryListType/);
        assert.match(content.query, /ScannerListUnderstood/);
        assert.doesNotMatch(content.query, /Check in portal|monitoringCoverage/i);
        for (const column of ['AgentlessScanning', 'ESLint', 'Bandit', 'TemplateAnalyzer', 'Checkov', 'Trivy']) {
            const formatter = content.gridSettings.formatters.find(value => value.columnMatch === column);
            assert.deepStrictEqual(formatter.formatOptions.thresholdsGrid.map(value => value.text), [
                'Enabled', 'Disabled', 'Not applicable', 'Not reported'
            ]);
            assert.strictEqual(formatter.formatOptions.thresholdsGrid[0].representation, 'green');
        }
    });

    it('honors the coverage switches and uses provider-themed relative bars', () => {
        for (const [name, parameterName] of [
            ['queryGitHubRelative', 'relativeCoverage'],
            ['queryGitHub', 'absoluteCoverage'],
            ['queryGitHubDetailed', 'detailedCoverage']
        ]) {
            assert.deepStrictEqual(get(name).conditionalVisibility, {
                parameterName, comparison: 'isEqualTo', value: 'Yes'
            });
        }
        assert.strictEqual(get('queryGitHubRelative').content.gridSettings.formatters[0].formatOptions.palette, 'gray');
        const gcp = root('GCP').content.items.find(item => item.name === 'GCP percentage').content;
        const palettes = Object.fromEntries(gcp.gridSettings.formatters
            .filter(value => value.formatter === 8)
            .map(value => [value.columnMatch, value.formatOptions.palette]));
        assert.deepStrictEqual(palettes, {
            CSPM1: 'blue', Servers1: 'red', Databases1: 'yellow', Containers1: 'green'
        });
    });
});
