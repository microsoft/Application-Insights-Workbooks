const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

const workbookPath = path.join(__dirname, '..', 'Workbooks', 'Windows Virtual Desktop',
    'AtScale', 'Connection MTTF', 'Connection MTTF.workbook');
const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));
const navigationWorkbookPath = path.join(__dirname, '..', 'Workbooks', 'Windows Virtual Desktop',
    'AtScale', 'WVD Insights', 'WVDWorkbookV2.workbook');
const navigationWorkbook = JSON.parse(fs.readFileSync(navigationWorkbookPath, 'utf8'));

function flattenItems(items) {
    return items.flatMap(item => [item, ...flattenItems(item.content.items || [])]);
}

function normalizeQuery(query) {
    return query.split(/\r?\n/).map(line => line.trim()).join('\n');
}

function sourcePipelines(query, table) {
    const pattern = new RegExp(`(?:^|\\n)${table}\\n((?:\\|[^\\n]*(?:\\n|$))+)`, 'g');
    return Array.from(normalizeQuery(query).matchAll(pattern), match => match[1]);
}

const items = flattenItems(workbook.items);
const navigationItems = flattenItems(navigationWorkbook.items);
const parameters = items.find(item => item.name === 'parameters_general').content.parameters;
const navigationMttfParameterGroups = ['parameters_mttf_filters']
    .map(name => navigationItems.find(item => item.name === name));
const navigationMttfParameters = navigationMttfParameterGroups
    .flatMap(item => item.content.parameters);
const dataViews = items.filter(item => item.type === 3 && item.content.queryType === 0);
const resourceFilter = '| where _ResourceId in~ ({HostPools})';
const gatewayNormalization = '| extend GatewayLocation = iff(isempty(GatewayRegion) or GatewayRegion == "", "Unknown", GatewayRegion)';
const gatewayFilter = "| where '*' in ({GatewayRegion}) or GatewayLocation in ({GatewayRegion})";
const gatewayReads = dataViews.flatMap(item =>
    sourcePipelines(item.content.query, 'WVDMultiLinkAdd').slice(1)
        .map((pipeline, index) => ({ name: `${item.name} link read ${index + 1}`, pipeline })));

describe('Connection MTTF navigation', () => {
    const reportTabs = navigationWorkbook.items.find(item => item.name === 'ReportTabs').content.links;

    it('places MTTF-specific filters above the report tabs', () => {
        const parameterLayout = navigationWorkbook.items
            .find(item => item.name === 'parameters_layout');
        const generalParameters = navigationItems
            .find(item => item.name === 'parameters_general');
        const reportTabsIndex = navigationWorkbook.items.findIndex(item => item.name === 'ReportTabs');
        const selectedTab = generalParameters.content.parameters
            .find(parameter => parameter.name === 'selectedTab');

        assert.deepEqual(parameterLayout.content.items.map(item => item.name),
            ['parameters_general', 'parameters_timerange']);
        assert.isTrue(parameterLayout.content.exportParameters);
        assert.equal(parameterLayout.styleSettings.maxWidth, '1350px');
        assert.equal(selectedTab.value, 'Overview');
        assert.isTrue(selectedTab.isGlobal);
        assert.isTrue(selectedTab.isHiddenWhenLocked);
        assert.equal(generalParameters.customWidth, '80');
        for (const group of navigationMttfParameterGroups) {
            assert.isBelow(navigationWorkbook.items.indexOf(parameterLayout),
                navigationWorkbook.items.indexOf(group), group.name);
            assert.isBelow(navigationWorkbook.items.indexOf(group), reportTabsIndex, group.name);
            assert.deepEqual(group.conditionalVisibility, {
                parameterName: 'selectedTab',
                comparison: 'isEqualTo',
                value: 'ConnectionMTTF'
            }, group.name);
        }
        assert.deepEqual(navigationMttfParameterGroups[0].content.parameters
            .map(parameter => parameter.name),
            ['MTTFTimeRange', 'GatewayRegion', 'ClientType', 'ClientVersion']);
        assert.notProperty(navigationMttfParameterGroups[0], 'customWidth');
        for (const name of ['MTTFTimeRange', 'GatewayRegion', 'ClientType', 'ClientVersion']) {
            assert.deepEqual(
                navigationMttfParameters.find(parameter => parameter.name === name),
                parameters.find(parameter => parameter.name === name),
                name);
        }

        const sharedTimeRangeGroup = navigationItems
            .find(item => item.name === 'parameters_timerange');
        assert.deepEqual(sharedTimeRangeGroup.conditionalVisibility, {
            parameterName: 'selectedTab',
            comparison: 'isNotEqualTo',
            value: 'ConnectionMTTF'
        });
        assert.equal(sharedTimeRangeGroup.customWidth, '20');
        assert.equal(sharedTimeRangeGroup.content.parameters[0].name, 'TimeRange');
    });

    it('places the tab between Connection Performance and Users', () => {
        const labels = reportTabs.map(link => link.linkLabel);
        const connectionPerformanceIndex = labels.indexOf('Connection Performance');

        assert.deepEqual(labels.slice(connectionPerformanceIndex, connectionPerformanceIndex + 3), [
            'Connection Performance',
            'Connection MTTF',
            'Users'
        ]);
    });

    it('loads the Connection MTTF template when selected', () => {
        const link = reportTabs.find(tab => tab.linkLabel === 'Connection MTTF');
        const group = navigationWorkbook.items.find(item =>
            item.type === 12 && item.conditionalVisibility?.value === link.subTarget);

        assert.equal(link.subTarget, 'ConnectionMTTF');
        assert.equal(group.content.loadFromTemplateId,
            'community-Workbooks/Windows Virtual Desktop/AtScale/Connection MTTF');
    });
});

describe('Connection MTTF filtering', () => {
    it('covers every data view and downstream link read', () => {
        assert.sameMembers(dataViews.map(item => item.name), [
            'MTTFBarChart', 'MTTFHistogram', 'MTTFUnifiedDetail', 'MTTFTransportDetail',
            'MTTFGatewayDetail', 'MTTFUnifiedConnections', 'MTTFTransportConnections',
            'MTTFGatewayConnections'
        ]);
        assert.lengthOf(gatewayReads, 6);
    });

    it('cascades subscriptions and resource groups into the host pool scope', () => {
        const resourceGroups = parameters.find(parameter => parameter.name === 'ResourceGroups');
        const hostPools = parameters.find(parameter => parameter.name === 'HostPools');
        assert.deepEqual(resourceGroups.crossComponentResources, ['{Subscriptions}']);
        assert.deepEqual(hostPools.crossComponentResources, ['{Subscriptions}']);
        assert.include(hostPools.query, 'resourceGroup in ({ResourceGroups})');
        assert.equal(hostPools.timeContextFromParameter, 'MTTFTimeRange');
    });

    it('offers 7, 14 and 30 days plus custom with 7 days selected', () => {
        const timeRange = parameters.find(parameter => parameter.name === 'MTTFTimeRange');

        assert.deepEqual(
            timeRange.typeSettings.selectableValues.map(value => value.durationMs),
            [604800000, 1209600000, 2592000000]);
        assert.isTrue(timeRange.typeSettings.allowCustom);
        assert.deepEqual(timeRange.value, { durationMs: 604800000 });
        assert.isUndefined(parameters.find(parameter => parameter.name === 'TimeRange'));
    });

    it('keeps the top gateway and client filters required with an All selection', () => {
        for (const name of ['GatewayRegion', 'ClientType', 'ClientVersion']) {
            const parameter = parameters.find(parameter => parameter.name === name);
            assert.isTrue(parameter.isRequired, name);
            assert.isTrue(parameter.multiSelect, name);
            assert.equal(parameter.quote, "'", name);
            assert.equal(parameter.delimiter, ',', name);
            assert.deepEqual(parameter.value, ['value::all'], name);
            assert.include(parameter.typeSettings.additionalResourceOptions, 'value::all', name);
            assert.equal(parameter.typeSettings.selectAllValue, '*', name);
            assert.equal(parameter.timeContextFromParameter, 'MTTFTimeRange', name);
            assert.deepEqual(parameter.crossComponentResources, ['{HostPools}'], name);
        }
    });

    it('keeps client option queries scoped to upstream filters', () => {
        for (const name of ['ClientType', 'ClientVersion']) {
            const query = parameters.find(parameter => parameter.name === name).query;
            const connections = sourcePipelines(query, 'WVDConnections');
            assert.lengthOf(connections, 1, name);
            assert.include(connections[0], resourceFilter, name);
            assert.include(connections[0],
                "| where '*' in ({GatewayRegion}) or CorrelationId in (_GatewayAllowed)", name);
            if (name === 'ClientVersion') {
                assert.include(connections[0],
                    "| where '*' in ({ClientType}) or ClientType in ({ClientType})", name);
            }
        }
    });

    for (const item of dataViews) {
        it(`${item.name} applies time, resource, gateway and client filters`, () => {
            assert.equal(item.content.timeContextFromParameter, 'MTTFTimeRange');
            assert.deepEqual(item.content.crossComponentResources, ['{HostPools}']);

            const connections = sourcePipelines(item.content.query, 'WVDConnections');
            assert.lengthOf(connections, 1);
            assert.include(connections[0], resourceFilter);
            assert.include(connections[0],
                "| where '*' in ({GatewayRegion}) or CorrelationId in (_GatewayAllowed)");
            for (const name of ['ClientType', 'ClientVersion']) {
                assert.include(connections[0],
                    `| where '*' in ({${name}}) or ${name} in ({${name}})`);
            }

            const gatewaySelection = sourcePipelines(item.content.query, 'WVDMultiLinkAdd')[0];
            assert.include(gatewaySelection, resourceFilter);
            assert.include(gatewaySelection, '| where _FilterGateway');
            assert.include(gatewaySelection,
                '| extend _GR = iff(isempty(GatewayRegion) or GatewayRegion == "", "Unknown", GatewayRegion)');
            assert.include(gatewaySelection, '| where _GR in ({GatewayRegion})');
            assert.include(gatewaySelection, '| distinct CorrelationId');
            assert.include(item.content.query, "let _FilterGateway = '*' !in ({GatewayRegion});");

            const errors = sourcePipelines(item.content.query, 'WVDErrors');
            assert.lengthOf(errors, 1);
            assert.include(errors[0], resourceFilter);
        });
    }

    for (const { name, pipeline } of gatewayReads) {
        it(`${name} filters gateway rows before aggregation`, () => {
            assert.include(pipeline, resourceFilter);
            assert.include(pipeline, gatewayNormalization);
            assert.include(pipeline, gatewayFilter);
            assert.isBelow(pipeline.indexOf(gatewayNormalization), pipeline.indexOf(gatewayFilter));
            assert.isBelow(pipeline.indexOf(gatewayFilter), pipeline.indexOf('| summarize'));
            assert.match(pipeline,
                /\| join kind=inner (?:SelectedConnections|\(SelectedConnections \| project CorrelationId\)|GatewayFiltered) on CorrelationId/);
        });
    }

    for (const selection of [['WUS2'], ['Unknown'], ['WUS2', 'EUS2'], ['*']]) {
        it(`preserves the gateway row predicate for ${selection.join(', ')}`, () => {
            const formatted = selection.map(value => `'${value}'`).join(',');
            for (const { name, pipeline } of gatewayReads) {
                const expanded = pipeline.replace(/\{GatewayRegion\}/g, formatted);
                assert.include(expanded,
                    `| where '*' in (${formatted}) or GatewayLocation in (${formatted})`, name);
            }
        });
    }

    it('uses the same filtered query for the histogram and chart', () => {
        assert.equal(
            items.find(item => item.name === 'MTTFBarChart').content.query,
            items.find(item => item.name === 'MTTFHistogram').content.query);
    });
});
