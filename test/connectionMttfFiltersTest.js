const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

const workbookPath = path.join(__dirname, '..', 'Workbooks', 'Windows Virtual Desktop',
    'AtScale', 'Connection MTTF', 'Connection MTTF.workbook');
const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));
const navigationWorkbookPath = path.join(__dirname, '..', 'Workbooks', 'Windows Virtual Desktop',
    'AtScale', 'WVD Insights', 'WVDWorkbookV2.workbook');
const navigationWorkbook = JSON.parse(fs.readFileSync(navigationWorkbookPath, 'utf8'));
const overviewWorkbookPath = path.join(__dirname, '..', 'Workbooks', 'Windows Virtual Desktop',
    'AtScale', 'Overview', 'Overview.workbook');
const overviewWorkbook = JSON.parse(fs.readFileSync(overviewWorkbookPath, 'utf8'));
const reliabilityWorkbookPath = path.join(__dirname, '..', 'Workbooks', 'Windows Virtual Desktop',
    'AtScale', 'Connection Reliability', 'Connection Reliability.workbook');
const reliabilityWorkbook = JSON.parse(fs.readFileSync(reliabilityWorkbookPath, 'utf8'));

function flattenItems(items) {
    return items.flatMap(item => [item, ...flattenItems(item.content.items || [])]);
}

function normalizeQuery(query) {
    return query.split(/\r?\n/).map(line => line.trim()).join('\n');
}

function sourcePipelines(query, table) {
    const pattern = new RegExp(
        `(?:^|\\n)(?:union isfuzzy=true )?${table}(?:,\\s*\\(datatable\\([^\\n]+\\)\\[\\]\\))?\\n([\\s\\S]*?)(?=\\n\\);|$)`, 'g');
    return Array.from(normalizeQuery(query).matchAll(pattern), match => match[1]);
}

function letBlock(query, name) {
    const match = normalizeQuery(query)
        .match(new RegExp(`(?:^|\\n)let ${name} = materialize\\(\\n([\\s\\S]*?)\\n\\);`));
    assert.isNotNull(match, name);
    return match[1];
}

function finalStatement(query) {
    const normalized = normalizeQuery(query);
    const start = normalized.lastIndexOf('\n);\n');
    assert.isAtLeast(start, 0);
    return normalized.slice(start + '\n);\n'.length);
}

function durationSecondsFor(query, events, windowStart, windowEnd) {
    const completed = letBlock(query, 'CompletedConnections');
    const connections = letBlock(query, 'Connections');
    const completedState = completed.match(/\| where State == "([^"]+)"/);
    const connectedState = connections.match(
        /ConnectedTime\s*=\s*minif\(TimeGenerated, State == "([^"]+)"\)/);
    assert.isNotNull(completedState);
    assert.isNotNull(connectedState);
    assert.include(completed, '| summarize EndTime = min(TimeGenerated) by CorrelationId');
    assert.include(connections,
        "| extend DurationSeconds = datetime_diff('second', EndTime, ConnectedTime)");

    const windowStartMs = Date.parse(windowStart);
    const windowEndMs = Date.parse(windowEnd);
    const observed = events.map(event => ({ ...event, time: Date.parse(event.time) }));
    const completions = observed.filter(event => event.state === completedState[1] &&
        event.time >= windowStartMs && event.time <= windowEndMs);
    if (!completions.length) {
        return null;
    }
    const endTime = Math.min(...completions.map(event => event.time));
    const starts = observed.filter(event => event.state === connectedState[1] && event.time <= endTime);
    const connectedTime = starts.length ? Math.min(...starts.map(event => event.time)) : null;

    if (connectedTime === null || endTime <= connectedTime) {
        return null;
    }
    return Math.floor(endTime / 1000) - Math.floor(connectedTime / 1000);
}

function mttfBucketFor(query, totalDurationSeconds, disruptionCount) {
    const caseBlock = normalizeQuery(query)
        .match(/\| extend MTTFBin = case\(\n([\s\S]*?)\n\)/);
    assert.isNotNull(caseBlock);

    const infinite = caseBlock[1].match(/DisruptionCount == 0, "([^"]+)"/);
    assert.isNotNull(infinite);
    const thresholds = Array.from(caseBlock[1].matchAll(
        /MeanTimeToFailureHours < ([\d.]+),\s*"([^"]+)"/g));
    const fallback = caseBlock[1].trim().split('\n').at(-1).match(/^"([^"]+)"$/);
    assert.isNotNull(fallback);

    const meanTimeToFailure = disruptionCount > 0
        ? totalDurationSeconds / disruptionCount / 3600
        : 0;
    if (disruptionCount === 0) {
        return infinite[1];
    }
    const threshold = thresholds.find(match => meanTimeToFailure < Number(match[1]));
    return threshold ? threshold[2] : fallback[1];
}

function udpTypeFor(query, udpUse) {
    const caseBlock = letBlock(query, 'Connections')
        .match(/\| extend UdpType = case\(\n([\s\S]*?)\n\)/);
    assert.isNotNull(caseBlock);

    const mappings = Array.from(caseBlock[1].matchAll(/UdpUse == "([^"]+)",\s*"([^"]+)"/g));
    const fallback = caseBlock[1].trim().split('\n').at(-1).match(/^"([^"]+)"$/);
    assert.isNotNull(fallback);

    const value = udpUse === null || udpUse === undefined ? '' : String(udpUse);
    const mapping = mappings.find(match => match[1] === value);
    return mapping ? mapping[2] : fallback[1];
}

function durationLabelFor(query, seconds) {
    const statement = finalStatement(query);
    const units = statement.match(
        /DurationUnitSeconds = iff\(DurationSeconds < ([\d.]+), ([\d.]+), ([\d.]+)\)/);
    const suffixes = statement.match(
        /iff\(DurationUnitSeconds == ([\d.]+), "([^"]+)", "([^"]+)"\)/);
    assert.isNotNull(units);
    assert.isNotNull(suffixes);
    assert.include(statement,
        '| extend DurationHundredths = tolong(round(DurationSeconds / DurationUnitSeconds * 100.0))');
    assert.include(statement,
        '| extend DurationDisplay = strcat(DurationHundredths / 100, ".", substring(tostring(100 + DurationHundredths % 100), 1), iff(');

    const unitSeconds = seconds < Number(units[1]) ? Number(units[2]) : Number(units[3]);
    const hundredths = Math.round(seconds / unitSeconds * 100);
    const suffix = unitSeconds === Number(suffixes[1]) ? suffixes[2] : suffixes[3];
    return `${Math.trunc(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}${suffix}`;
}

const items = flattenItems(workbook.items);
const navigationItems = flattenItems(navigationWorkbook.items);
const reliabilityItems = flattenItems(reliabilityWorkbook.items);
const parameters = items.find(item => item.name === 'parameters_general').content.parameters;
const navigationMttfParameterGroups = ['parameters_mttf_filters']
    .map(name => navigationItems.find(item => item.name === name));
const navigationMttfParameters = navigationMttfParameterGroups
    .flatMap(item => item.content.parameters);
const querySteps = items.filter(item => item.type === 3 && item.content.queryType === 0);
const dataViews = querySteps.filter(item => item.name !== 'MTTFDataAvailability');
const resourceFilter = '| where _ResourceId in~ ({HostPools})';
const gatewayNormalization = '| extend GatewayLocation = iff(isempty(GatewayRegion), "Unknown", GatewayRegion)';
const gatewayFilter = "| where '*' in ({GatewayRegion}) or GatewayLocation in ({GatewayRegion})";
const transportReads = dataViews.flatMap(item =>
    sourcePipelines(item.content.query, 'WVDMultiLinkAdd')
        .map((pipeline, index) => ({ name: `${item.name} link read ${index + 1}`, pipeline })));
const windowLets = [
    'let WindowStart = {MTTFTimeRange:start};',
    'let WindowEnd = min_of({MTTFTimeRange:end}, now());'
].join('\n');
const timeWindow = '| where TimeGenerated between (WindowStart .. WindowEnd)';
const timeHistory = '| where TimeGenerated <= WindowEnd';
const completedDuration = [
    '| where isnotnull(ConnectedTime)',
    '| where EndTime > ConnectedTime',
    "| extend DurationSeconds = datetime_diff('second', EndTime, ConnectedTime)"
].join('\n');
const kqlParameters = parameters.filter(parameter => parameter.queryType === 0);
const mttfQueries = [
    ...querySteps.map(item => ({ name: item.name, content: item.content })),
    ...kqlParameters.map(parameter => ({ name: parameter.name, content: parameter }))
];

describe('Connection MTTF navigation', () => {
    const reportTabs = navigationWorkbook.items.find(item => item.name === 'ReportTabs').content.links;

    it('makes shared Overview filters available for template merging at workbook scope', () => {
        const overviewIndex = navigationWorkbook.items.findIndex(item => item.name === 'Overview');
        assert.isAtLeast(overviewIndex, 0);
        const outerParameters = navigationWorkbook.items.slice(0, overviewIndex)
            .filter(item => item.type === 9)
            .flatMap(item => item.content.parameters);
        const overviewParameters = overviewWorkbook.items
            .filter(item => item.type === 9)
            .flatMap(item => item.content.parameters);

        assert.isNotEmpty(overviewParameters);
        for (const parameter of overviewParameters) {
            const matches = outerParameters.filter(outer => outer.name === parameter.name);
            assert.lengthOf(matches, 1, `${parameter.name} must be declared once at workbook scope`);
            assert.equal(matches[0].type, parameter.type, parameter.name);
        }
    });

    it('places MTTF-specific filters above the report tabs', () => {
        const generalParameters = navigationWorkbook.items
            .find(item => item.name === 'parameters_general');
        const sharedTimeRangeGroup = navigationWorkbook.items
            .find(item => item.name === 'parameters_timerange');
        const reportTabsIndex = navigationWorkbook.items.findIndex(item => item.name === 'ReportTabs');
        const selectedTab = generalParameters.content.parameters
            .find(parameter => parameter.name === 'selectedTab');

        assert.isBelow(navigationWorkbook.items.indexOf(generalParameters),
            navigationWorkbook.items.indexOf(sharedTimeRangeGroup));
        assert.equal(generalParameters.styleSettings.maxWidth, '1350px');
        assert.equal(selectedTab.value, 'Overview');
        assert.isTrue(selectedTab.isGlobal);
        assert.isTrue(selectedTab.isHiddenWhenLocked);
        assert.equal(generalParameters.customWidth, '100');
        for (const group of navigationMttfParameterGroups) {
            assert.isBelow(navigationWorkbook.items.indexOf(sharedTimeRangeGroup),
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

        assert.deepEqual(sharedTimeRangeGroup.conditionalVisibility, {
            parameterName: 'selectedTab',
            comparison: 'isNotEqualTo',
            value: 'ConnectionMTTF'
        });
        assert.equal(sharedTimeRangeGroup.customWidth, '100',
            'Time Range must occupy a full-width row below the shared resource filters');
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
    it('covers every data view and transport enrichment read', () => {
        assert.sameMembers(dataViews.map(item => item.name), [
            'MTTFBarChart', 'MTTFHistogram', 'MTTFUnifiedDetail', 'MTTFTransportDetail',
            'MTTFGatewayDetail', 'MTTFUnifiedConnections', 'MTTFTransportConnections',
            'MTTFGatewayConnections'
        ]);
        assert.lengthOf(transportReads, 4);
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

        assert.equal(timeRange.label, 'Completion Time Range');
        assert.deepEqual(
            timeRange.typeSettings.selectableValues.map(value => value.durationMs),
            [604800000, 1209600000, 2592000000]);
        assert.isTrue(timeRange.typeSettings.allowCustom);
        assert.deepEqual(timeRange.value, { durationMs: 604800000 });
        assert.isUndefined(parameters.find(parameter => parameter.name === 'TimeRange'));
    });

    it('selects completions in range and retrieves only their available history without a fixed lookback', () => {
        assert.sameMembers(kqlParameters.map(parameter => parameter.name),
            ['GatewayRegion', 'ClientType', 'ClientVersion']);
        for (const { name, content } of mttfQueries) {
            assert.notProperty(content, 'timeContextFromParameter', name);
            assert.notProperty(content, 'timeContext', name);

            const query = normalizeQuery(content.query);
            assert.equal(query.slice(0, windowLets.length + 1), `${windowLets}\n`, name);
            assert.lengthOf(query.match(/\{MTTFTimeRange\b/g), 2, name);
            assert.notMatch(query, /\bLookback\b|\bWindowedStart\b|\bWindowedEnd\b/, name);
            const completed = letBlock(query, 'CompletedConnections');
            assert.include(completed, timeWindow, name);
            assert.include(completed, resourceFilter, name);
            assert.include(completed, '| where State == "Completed"', name);
            assert.include(completed, '| summarize EndTime = min(TimeGenerated) by CorrelationId', name);

            const connectionReads = sourcePipelines(query, 'WVDConnections');
            assert.lengthOf(connectionReads, 2, name);
            assert.equal(connectionReads[0].split('\n')[0], timeWindow, name);
            assert.equal(connectionReads[1].split('\n')[0], timeHistory, name);
            assert.include(connectionReads[1], resourceFilter, name);
            assert.include(connectionReads[1],
                '| join kind=inner CompletedConnections on CorrelationId', name);
            assert.include(connectionReads[1], '| where TimeGenerated <= EndTime', name);

            for (const table of ['WVDMultiLinkAdd', 'WVDErrors']) {
                const pipelines = sourcePipelines(query, table);
                assert.lengthOf(pipelines, (query.match(new RegExp(`\\b${table}\\b`, 'g')) || []).length,
                    `${name} ${table}`);
                for (const pipeline of pipelines) {
                    assert.equal(pipeline.split('\n')[0], timeHistory, `${name} ${table}`);
                }
            }
        }
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
            assert.deepEqual(parameter.crossComponentResources, ['{HostPools}'], name);
        }
    });

    it('keeps client option queries scoped to upstream filters', () => {
        for (const name of ['ClientType', 'ClientVersion']) {
            const query = parameters.find(parameter => parameter.name === name).query;
            const sources = sourcePipelines(query, 'WVDConnections');
            assert.lengthOf(sources, 2, name);
            const connections = sources[1];
            assert.include(connections, resourceFilter, name);
            assert.notInclude(query, 'WVDMultiLinkAdd', name);
            const aggregationEnd = connections.indexOf('by CorrelationId');
            assert.isAtLeast(aggregationEnd, 0, name);
            for (const field of ['GatewayRegion', 'ClientType',
                ...(name === 'ClientVersion' ? ['ClientVersion'] : [])]) {
                assert.include(connections.slice(0, aggregationEnd),
                    `take_anyif(${field}, isnotempty(${field}))`, name);
            }
            assert.include(connections, gatewayNormalization, name);
            assert.include(connections, gatewayFilter, name);
            assert.isAbove(connections.indexOf(gatewayNormalization), aggregationEnd, name);
            assert.isAbove(connections.indexOf(gatewayFilter),
                connections.indexOf(gatewayNormalization), name);
            if (name === 'ClientVersion') {
                assert.include(connections,
                    "| where '*' in ({ClientType}) or ClientType in ({ClientType})", name);
                assert.isAbove(connections.indexOf("| where '*' in ({ClientType})"),
                    aggregationEnd, name);
            }
        }
    });

    for (const item of dataViews) {
        it(`${item.name} applies resource, gateway and client filters to full completed-connection durations`, () => {
            assert.deepEqual(item.content.crossComponentResources, ['{HostPools}']);

            const connections = letBlock(item.content.query, 'Connections');
            assert.include(connections, resourceFilter);
            const aggregationEnd = connections.indexOf('by CorrelationId, EndTime');
            assert.isAtLeast(aggregationEnd, 0);
            assert.match(connections.slice(0, aggregationEnd),
                /ConnectedTime\s*=\s*minif\(TimeGenerated, State == "Connected"\)/);
            assert.isAbove(connections.indexOf(completedDuration), aggregationEnd,
                'full durations require a real Connected event and the selected completion');
            assert.lengthOf(connections.match(/\bDurationSeconds\s*=/g), 1);
            assert.notInclude(connections, 'coalesce(ConnectedTime');
            for (const name of ['ClientType', 'ClientVersion']) {
                const filter = `| where '*' in ({${name}}) or ${name} in ({${name}})`;
                assert.include(connections, filter);
                assert.match(connections.slice(0, aggregationEnd),
                    new RegExp(`${name}\\s*=\\s*take_anyif\\(${name}, isnotempty\\(${name}\\)\\)`));
                assert.isAbove(connections.indexOf(filter), aggregationEnd,
                    `${name} must filter correlated connections, not individual lifecycle events`);
            }

            assert.include(connections.slice(0, aggregationEnd),
                'GatewayRegion = take_anyif(GatewayRegion, isnotempty(GatewayRegion))');
            assert.include(connections, gatewayNormalization);
            assert.include(connections, gatewayFilter);
            assert.isAbove(connections.indexOf(gatewayNormalization), aggregationEnd,
                'empty lifecycle fields must not override a populated connection gateway');
            assert.isAbove(connections.indexOf(gatewayFilter),
                connections.indexOf(gatewayNormalization));
            assert.notInclude(item.content.query, '_GatewayAllowed');
            assert.notInclude(item.content.query, '_HasMultiLink');

            const errors = sourcePipelines(item.content.query, 'WVDErrors');
            assert.lengthOf(errors, 1);
            assert.include(errors[0], resourceFilter);
        });
    }

    for (const { name, pipeline } of transportReads) {
        it(`${name} enriches selected connections without re-filtering link gateways`, () => {
            assert.include(pipeline, resourceFilter);
            assert.notInclude(pipeline, '{GatewayRegion}');
            assert.notInclude(pipeline, 'GatewayLocation');
            assert.match(pipeline,
                /\| join kind=inner (?:SelectedConnections|\(SelectedConnections \| project CorrelationId\)) on CorrelationId/);
        });
    }

    for (const selection of [['WUS2'], ['Unknown'], ['WUS2', 'EUS2'], ['*']]) {
        it(`preserves the connection gateway predicate for ${selection.join(', ')}`, () => {
            const formatted = selection.map(value => `'${value}'`).join(',');
            for (const item of dataViews) {
                const pipeline = letBlock(item.content.query, 'Connections');
                const expanded = pipeline.replace(/\{GatewayRegion\}/g, formatted);
                assert.include(expanded,
                    `| where '*' in (${formatted}) or GatewayLocation in (${formatted})`, item.name);
            }
        });
    }

    it('uses the same filtered query for the histogram and chart', () => {
        assert.equal(
            items.find(item => item.name === 'MTTFBarChart').content.query,
            items.find(item => item.name === 'MTTFHistogram').content.query);
    });
});

describe('Connection MTTF calculation results', () => {
    const query = items.find(item => item.name === 'MTTFBarChart').content.query;
    const windowStart = '2026-01-10T00:00:00Z';
    const windowEnd = '2026-01-11T00:00:00Z';

    it('uses full durations only for connections completed in the range with known Connected timestamps', () => {
        const cases = [
            {
                name: 'still connected after connecting inside the range',
                events: [{ state: 'Connected', time: '2026-01-10T02:00:00Z' }],
                expected: null
            },
            {
                name: 'still connected after connecting before the range',
                events: [{ state: 'Connected', time: '2026-01-02T23:59:59Z' }],
                expected: null
            },
            {
                name: 'completed with Connected telemetry more than seven days before the range',
                events: [
                    { state: 'Started', time: '2025-12-31T23:59:00Z' },
                    { state: 'Connected', time: '2026-01-01T00:00:00Z' },
                    { state: 'Completed', time: '2026-01-10T03:00:00Z' }
                ],
                expected: 788400
            },
            {
                name: 'connected before the range and completed inside it',
                events: [
                    { state: 'Connected', time: '2026-01-09T23:00:00Z' },
                    { state: 'Completed', time: '2026-01-10T05:00:00Z' }
                ],
                expected: 21600
            },
            {
                name: 'connected inside the range with completion telemetry after the range',
                events: [
                    { state: 'Connected', time: '2026-01-10T02:00:00Z' },
                    { state: 'Completed', time: '2026-01-11T01:00:00Z' }
                ],
                expected: null
            },
            {
                name: 'completed before the range',
                events: [
                    { state: 'Connected', time: '2026-01-08T23:00:00Z' },
                    { state: 'Completed', time: '2026-01-09T23:00:00Z' }
                ],
                expected: null
            },
            {
                name: 'ten-second connection retains its full duration',
                events: [
                    { state: 'Connected', time: '2026-01-10T02:00:00Z' },
                    { state: 'Completed', time: '2026-01-10T02:00:10Z' }
                ],
                expected: 10
            },
            {
                name: 'half-hour connection is not truncated to zero hours',
                events: [
                    { state: 'Connected', time: '2026-01-10T02:00:00Z' },
                    { state: 'Completed', time: '2026-01-10T02:30:00Z' }
                ],
                expected: 1800
            },
            {
                name: 'only Started telemetry',
                events: [{ state: 'Started', time: '2026-01-10T01:00:00Z' }],
                expected: null
            },
            {
                name: 'completion exactly at the range start',
                events: [
                    { state: 'Connected', time: '2026-01-09T23:00:00Z' },
                    { state: 'Completed', time: windowStart }
                ],
                expected: 3600
            },
            {
                name: 'completion exactly at the range end',
                events: [
                    { state: 'Connected', time: '2026-01-10T23:00:00Z' },
                    { state: 'Completed', time: windowEnd }
                ],
                expected: 3600
            },
            {
                name: 'completion without retained Connected telemetry',
                events: [{ state: 'Completed', time: '2026-01-10T03:00:00Z' }],
                expected: null
            },
            {
                name: 'Started and Completed do not substitute for Connected',
                events: [
                    { state: 'Started', time: '2026-01-10T01:00:00Z' },
                    { state: 'Completed', time: '2026-01-10T03:00:00Z' }
                ],
                expected: null
            },
            {
                name: 'Connected occurs after completion',
                events: [
                    { state: 'Connected', time: '2026-01-10T04:00:00Z' },
                    { state: 'Completed', time: '2026-01-10T03:00:00Z' }
                ],
                expected: null
            },
            {
                name: 'no lifecycle telemetry',
                events: [],
                expected: null
            }
        ];

        for (const item of dataViews) {
            for (const testCase of cases) {
                const actual = durationSecondsFor(item.content.query, testCase.events, windowStart, windowEnd);
                const name = `${item.name}: ${testCase.name}`;
                if (testCase.expected === null) {
                    assert.isNull(actual, name);
                } else {
                    assert.equal(actual, testCase.expected, name);
                }
            }
        }
    });

    it('counts historical errors only for eligible connections and deduplicates each failed connection', () => {
        for (const item of dataViews) {
            const errors = sourcePipelines(item.content.query, 'WVDErrors')[0];
            assert.include(errors, timeHistory, item.name);
            assert.notInclude(errors, 'WindowStart', item.name);
            assert.include(errors,
                '| join kind=inner (Connections | project CorrelationId) on CorrelationId', item.name);
            if (item.content.query.includes('let Failures =')) {
                assert.include(errors, '| distinct CorrelationId', item.name);
            } else {
                assert.match(errors, /\| summarize .*HasError = true by CorrelationId/, item.name);
            }
        }
    });

    it('visibly reports excluded completed connections using the same filtered cohort as the charts', () => {
        const availability = items.find(item => item.name === 'MTTFDataAvailability');
        assert.isDefined(availability);
        assert.isBelow(workbook.items.indexOf(availability),
            workbook.items.findIndex(item => item.name === 'MTTFBarChartGroup'));
        assert.deepEqual(availability.content.crossComponentResources, ['{HostPools}']);
        assert.equal(availability.content.visualization, 'card');
        assert.equal(letBlock(availability.content.query, 'Connections'),
            letBlock(query, 'Connections').replace(`\n${completedDuration}`, ''));
        assert.include(availability.content.query,
            'MissingConnectedCount = countif(isnull(ConnectedTime))');
        assert.include(availability.content.query,
            'InvalidDurationCount = countif(isnotnull(ConnectedTime) and EndTime <= ConnectedTime)');
        assert.include(finalStatement(availability.content.query), 'MissingConnectedCount');
        assert.include(finalStatement(availability.content.query), 'InvalidDurationCount');
    });

    it('sums full completed durations per user and counts each historically failed connection once', () => {
        const sessions = [
            ['failed-1', 'user-a', '2026-01-09T21:00:00Z', '2026-01-10T01:00:00Z'],
            ['healthy', 'user-a', '2026-01-10T02:00:00Z', '2026-01-10T04:00:00Z'],
            ['failed-2', 'user-a', '2026-01-10T04:00:00Z', '2026-01-10T05:00:00Z'],
            ['other-user', 'user-b', '2026-01-10T06:00:00Z', '2026-01-10T07:00:00Z'],
            ['ongoing', 'user-a', '2026-01-09T01:00:00Z', null],
            ['missing-start', 'user-a', null, '2026-01-10T06:00:00Z']
        ];
        const errors = [
            ['failed-1', '2026-01-09T22:00:00Z'],
            ['failed-1', '2026-01-09T23:00:00Z'],
            ['failed-2', '2026-01-10T04:30:00Z'],
            ['healthy', '2026-01-11T01:00:00Z'],
            ['ongoing', '2026-01-10T03:00:00Z'],
            ['missing-start', '2026-01-10T05:00:00Z']
        ];
        const failedIds = new Set(errors.filter(([, time]) => Date.parse(time) <= Date.parse(windowEnd))
            .map(([id]) => id));

        for (const item of dataViews) {
            const users = {};
            for (const [id, user, connected, completed] of sessions) {
                const events = [];
                if (connected) events.push({ state: 'Connected', time: connected });
                if (completed) events.push({ state: 'Completed', time: completed });
                const seconds = durationSecondsFor(item.content.query, events, windowStart, windowEnd);
                if (seconds === null) continue;
                const total = users[user] || (users[user] = { seconds: 0, failures: 0 });
                total.seconds += seconds;
                total.failures += Number(failedIds.has(id));
            }
            assert.deepEqual(users, {
                'user-a': { seconds: 25200, failures: 2 },
                'user-b': { seconds: 3600, failures: 0 }
            }, item.name);
            assert.equal(mttfBucketFor(item.content.query, users['user-a'].seconds, users['user-a'].failures),
                '3 - 4 hrs', item.name);
            assert.equal(mttfBucketFor(item.content.query, users['user-b'].seconds, users['user-b'].failures),
                'Infinite', item.name);
        }
    });

    it('converts seconds to hours only after per-user aggregation in every view', () => {
        for (const item of dataViews) {
            assert.notInclude(letBlock(item.content.query, 'Connections'), '/ 3600.0', item.name);
            assert.match(item.content.query,
                /TotalDurationSeconds\s*= sum\(DurationSeconds\)/, item.name);
            assert.include(item.content.query,
                'MeanTimeToFailureHours = iff(DisruptionCount > 0, TotalDurationSeconds / todouble(DisruptionCount) / 3600.0, todouble(0))',
                item.name);
        }
    });

    it('separates finite 10+ MTTF from zero-failure Infinite in every view', () => {
        const cases = [
            [0, 0, 'Infinite'],
            [36000, 0, 'Infinite'],
            [10, 1, '0 - 1 hrs'],
            [1800, 1, '0 - 1 hrs'],
            [3600, 1, '1 - 2 hrs'],
            [7200, 1, '2 - 3 hrs'],
            [10800, 1, '3 - 4 hrs'],
            [14400, 1, '4 - 5 hrs'],
            [18000, 1, '5 - 6 hrs'],
            [21600, 1, '6 - 7 hrs'],
            [25200, 1, '7 - 8 hrs'],
            [28800, 1, '8 - 9 hrs'],
            [32400, 1, '9 - 10 hrs'],
            [71999, 2, '9 - 10 hrs'],
            [36000, 1, '10+ hrs'],
            [72000, 2, '10+ hrs']
        ];
        for (const item of dataViews) {
            for (const [totalDurationSeconds, disruptionCount, expected] of cases) {
                assert.equal(mttfBucketFor(item.content.query, totalDurationSeconds, disruptionCount),
                    expected, `${item.name}: ${totalDurationSeconds} seconds / ${disruptionCount} disruptions`);
            }
        }
    });

});

describe('Connection MTTF optional MultiLink transport', () => {
    const queryOf = name => items.find(item => item.name === name).content.query;
    const transportFallback = '| extend TransportCapability = coalesce(TransportCapability, UdpType)';
    const transportNames = ['MTTFTransportDetail', 'MTTFUnifiedConnections', 'MTTFTransportConnections',
        'MTTFGatewayConnections'];

    for (const name of transportNames) {
        it(`${name} prefers MultiLink capability and falls back to the connection UDP type`, () => {
            const lines = finalStatement(queryOf(name)).split('\n');
            const join = lines.findIndex(line => /^\| join kind=leftouter \(?MultiLinkInfo\b/.test(line));
            const coalesce = lines.indexOf(transportFallback);

            assert.equal(lines[0], 'SelectedConnections');
            assert.notInclude(lines.join('\n'), 'join kind=inner');
            assert.isAtLeast(join, 0);
            assert.isAbove(coalesce, join);
            if (name === 'MTTFTransportDetail') {
                assert.include(letBlock(queryOf(name), 'SelectedConnections'),
                    '| project CorrelationId, UdpType');
            }
            if (name === 'MTTFTransportConnections') {
                assert.isBelow(coalesce, lines.indexOf('| where TransportCapability == SelectedTransport'));
            }
        });
    }

    it('uses the latest nonempty UDP value per connection without requiring the column', () => {
        for (const name of transportNames) {
            const connections = letBlock(queryOf(name), 'Connections');
            assert.include(connections, [
                '| extend UdpUse = tostring(column_ifexists("UdpUse", ""))',
                '| extend UdpUseTime = iff(isnotempty(UdpUse), TimeGenerated, datetime(null))',
                '| summarize',
                'arg_max(UdpUseTime, UdpUse),'
            ].join('\n'), name);
            assert.isAbove(connections.indexOf('| extend UdpType = case('),
                connections.indexOf('by CorrelationId'), name);
        }
    });

    it('maps legacy UDP types and keeps missing or unrecognized values Unknown', () => {
        const cases = [
            [0, 'NotUsed'],
            [1, 'ShortpathPrivate'],
            [2, 'ShortpathPublic'],
            [4, 'Relay'],
            [16, 'Multipath'],
            ['2', 'ShortpathPublic'],
            [null, 'Unknown'],
            [undefined, 'Unknown'],
            ['', 'Unknown'],
            [8, 'Unknown'],
            ['invalid', 'Unknown']
        ];
        for (const name of transportNames) {
            for (const [udpUse, expected] of cases) {
                assert.equal(udpTypeFor(queryOf(name), udpUse), expected, `${name}: ${udpUse}`);
            }
        }
    });

    it('uses reported Multipath for the Multi-Link indicator only when link counts are absent', () => {
        for (const name of transportNames.filter(name => name !== 'MTTFTransportDetail')) {
            assert.include(finalStatement(queryOf(name)),
                '| extend IsMultiLink = coalesce(LinkCount > 1, UdpType == "Multipath")', name);
        }
    });

    it('groups connection gateways without requiring MultiLink telemetry', () => {
        const query = queryOf('MTTFGatewayDetail');

        assert.notInclude(query, 'WVDMultiLinkAdd');
        assert.include(letBlock(query, 'SelectedConnections'),
            '| project CorrelationId, GatewayLocation');
        assert.deepEqual(finalStatement(query).split('\n'), [
            'SelectedConnections',
            '| summarize ConnectionCount = dcount(CorrelationId) by GatewayLocation',
            '| order by ConnectionCount desc'
        ]);
    });

    it('selects connection gateways before optional transport enrichment', () => {
        const query = queryOf('MTTFGatewayConnections');

        assert.include(letBlock(query, 'SelectedConnections'),
            '| where GatewayLocation == SelectedGateway');
        assert.notInclude(query, 'GatewayRows');
        assert.notInclude(query, 'GatewayFiltered');
        assert.include(letBlock(query, 'LinkTransport'),
            '| join kind=inner (SelectedConnections | project CorrelationId) on CorrelationId');
    });

    it('does not use N/A for unavailable MultiLink data', () => {
        for (const { name, content } of mttfQueries) {
            assert.notInclude(content.query, 'N/A', name);
        }
    });

    it('sources gateway options from connections and offers Unknown rather than Unavailable', () => {
        const query = parameters.find(parameter => parameter.name === 'GatewayRegion').query;

        assert.notInclude(query, 'WVDMultiLinkAdd');
        assert.notInclude(query, 'Unavailable');
        assert.include(query,
            '| summarize GatewayRegion = take_anyif(GatewayRegion, isnotempty(GatewayRegion)) by CorrelationId');
        assert.include(query, gatewayNormalization);
        assert.deepEqual(normalizeQuery(query).split('\n').slice(-3), [
            '| union (datatable(GatewayLocation:string)["Unknown"])',
            '| distinct GatewayLocation',
            '| order by GatewayLocation asc'
        ]);
    });

    it('shows minutes below two hours and hours at or above two hours with two decimal places', () => {
        const cases = [
            [51, '0.85 min'],
            [90, '1.50 min'],
            [3600, '60.00 min'],
            [7199, '119.98 min'],
            [7200, '2.00 hr'],
            [7201, '2.00 hr'],
            [9000, '2.50 hr'],
            [172800, '48.00 hr']
        ];
        for (const name of ['MTTFUnifiedConnections', 'MTTFTransportConnections', 'MTTFGatewayConnections']) {
            for (const [seconds, expected] of cases) {
                assert.equal(durationLabelFor(queryOf(name), seconds), expected, `${name}: ${seconds} seconds`);
            }
        }
    });

    it('keeps duration sorting numeric and applies formatting only after MTTF aggregation', () => {
        for (const name of ['MTTFUnifiedConnections', 'MTTFTransportConnections', 'MTTFGatewayConnections']) {
            const grid = items.find(item => item.name === name).content.gridSettings;
            const label = grid.labelSettings.find(setting => setting.columnId === 'DurationSeconds');
            assert.equal(label?.label, 'Connection Duration', name);
            const duration = grid.formatters.find(formatter => formatter.columnMatch === 'DurationSeconds');
            assert.equal(duration?.formatter, 18, name);
            assert.deepEqual(duration.formatOptions.thresholdsGrid, [{
                operator: 'Default',
                thresholdValue: null,
                representation: 'Blank',
                text: '["DurationDisplay"]'
            }], name);
            const display = grid.formatters.find(formatter => formatter.columnMatch === 'DurationDisplay');
            assert.equal(display?.formatter, 5, name);
            const statement = finalStatement(queryOf(name));
            const projection = statement.match(/\| project\s+([\s\S]*?)\n\| sort by/);
            assert.isNotNull(projection, name);
            assert.includeMembers(projection[1].split(',').map(column => column.trim()),
                ['DurationSeconds', 'DurationDisplay'], name);
            assert.notMatch(statement, /\| extend DurationSeconds\s*=/, name);
            assert.notInclude(queryOf(name), 'DurationMinutes', name);
            assert.notInclude(letBlock(queryOf(name), 'Connections'), 'round(', name);
            assert.notInclude(letBlock(queryOf(name), 'SelectedUsers'), 'round(', name);
        }
    });
});

describe('Connection MultiLink availability', () => {
    for (const [name, workbookItems, expectedQueryCount] of [
        ['MTTF', items, 4],
        ['navigation', navigationItems, 0],
        ['Reliability', reliabilityItems, 3]
    ]) {
        it(`${name} keeps every MultiLink read optional without adding synthetic events`, () => {
            const queries = workbookItems.flatMap(item =>
                [item.content, ...(item.content.parameters || [])]
                    .map(content => ({ name: content.name || item.name, query: content.query })))
                .filter(content => content.query?.includes('WVDMultiLinkAdd'));
            assert.lengthOf(queries, expectedQueryCount);

            for (const { name, query } of queries) {
                const sources = Array.from(query.matchAll(
                    /union isfuzzy=true WVDMultiLinkAdd,\s*\(datatable\(([^)]+)\)\[\]\)/g));
                assert.lengthOf(sources, query.match(/\bWVDMultiLinkAdd\b/g).length, name);
                for (const source of sources) {
                    const columns = Object.fromEntries(source[1].split(',')
                        .map(column => column.trim().split(':').map(value => value.trim())));
                    assert.deepEqual(columns, {
                        TimeGenerated: 'datetime',
                        _ResourceId: 'string',
                        CorrelationId: 'string',
                        GatewayRegion: 'string',
                        LinkId: 'string',
                        ClientTransportType: 'string',
                        ServerTransportType: 'string'
                    }, name);
                }
                if (name === 'PivotedDisconnectsTable' || name === 'RankedGroupedErrors' ||
                    name === 'DisconnectionListSample') {
                    assert.include(query, '| join kind=leftouter (', name);
                    assert.include(query,
                        '| extend TransportCapability = coalesce(TransportCapability, "Unknown")', name);
                }
            }
        });
    }
});

describe('Connection MTTF pivots', () => {
    it('declares a global pivot before computing its label without preselecting a tile', () => {
        const selector = items.find(item => item.name === 'MTTFPivotTile');
        const pivotIndex = parameters.findIndex(parameter =>
            parameter.name === selector.content.exportParameterName);
        const labelIndex = parameters.findIndex(parameter => parameter.name === 'MTTFPivotLabel');

        assert.isAtLeast(pivotIndex, 0);
        assert.isBelow(pivotIndex, labelIndex);
        assert.isTrue(parameters[pivotIndex].isGlobal);
        assert.isTrue(parameters[pivotIndex].isHiddenWhenLocked);
        assert.equal(parameters[pivotIndex].value, '');
        const labelQuery = JSON.parse(parameters[labelIndex].query);
        assert.equal(labelQuery.transformers[0].settings.tablePath, '$["{MTTFPivot}"]');
    });

    it('keeps IPv6 and missing client IPs in the same buckets across detail and connection views', () => {
        for (const name of ['MTTFUnifiedDetail', 'MTTFUnifiedConnections']) {
            const query = items.find(item => item.name === name).content.query;
            assert.match(query,
                /ClientIP16\s*=\s*case\(isempty\(ClientIPAddress\), "Unknown", ClientIPAddress contains ":", "<IPv6>", format_ipv4_mask\(ClientIPAddress, 16\)\)/,
                name);
            assert.include(query, 'SelectedPivot == "ClientIPAddress", ClientIP16', name);
        }
    });

    it('shows connection drill-downs only while their source grid is visible with a selection', () => {
        for (const [detailName, connectionsName] of [
            ['MTTFUnifiedDetail', 'MTTFUnifiedConnections'],
            ['MTTFTransportDetail', 'MTTFTransportConnections'],
            ['MTTFGatewayDetail', 'MTTFGatewayConnections']
        ]) {
            const detail = items.find(item => item.name === detailName);
            const connections = items.find(item => item.name === connectionsName);
            assert.deepEqual(connections.conditionalVisibilities, [
                ...detail.conditionalVisibilities,
                { parameterName: detail.content.exportParameterName, comparison: 'isNotEqualTo', value: '' }
            ], connectionsName);
        }
    });
});

describe('Connection transport capability', () => {
    const classifiers = [...items, ...reliabilityItems]
        .filter(item => item.content.query?.includes('LinkTransport'));

    it('classifies transport in every MTTF and Reliability transport view', () => {
        assert.sameMembers(classifiers.map(item => item.name), [
            'MTTFTransportDetail', 'MTTFUnifiedConnections', 'MTTFTransportConnections', 'MTTFGatewayConnections',
            'PivotedDisconnectsTable', 'RankedGroupedErrors', 'DisconnectionListSample'
        ]);
    });

    for (const { name, content: { query } } of classifiers) {
        it(`${name} matches transport types case-insensitively`, () => {
            assert.include(query, 'ClientTransportType =~ "DIRECT" and ServerTransportType =~ "DIRECT"');
            assert.lengthOf(query.match(/TransportType in~ \("DIRECT",\s*"STUN"\)/g) || [], 2);
            assert.lengthOf(query.match(/TransportType in~ \("WEBSOCKET",\s*""\)/g) || [], 2);
            assert.notMatch(query, /TransportType (?:==|in) /);
        });

        it(`${name} labels connections without a recognized link as Other`, () => {
            assert.include(query, 'HasTCPWebSocket = countif(LinkTransport == "TCP WebSocket") > 0');
            assert.match(query,
                /HasTURNRelay, "TURN Relay",\s*HasTCPWebSocket, "TCP WebSocket",\s*"Other"\s*\)/);
        });
    }
});
