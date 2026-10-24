const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

const workbookPath = path.join(__dirname, '..', 'Workbooks', 'Windows Virtual Desktop',
    'AtScale', 'Connection MTTF', 'Connection MTTF.workbook');
const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));
const navigationWorkbookPath = path.join(__dirname, '..', 'Workbooks', 'Windows Virtual Desktop',
    'AtScale', 'WVD Insights', 'WVDWorkbookV2.workbook');
const navigationWorkbook = JSON.parse(fs.readFileSync(navigationWorkbookPath, 'utf8'));
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

function durationHoursFor(query, events, windowStart, windowEnd) {
    const normalized = normalizeQuery(query);
    const lookback = normalized.match(/let Lookback = (\d+)d;/);
    assert.isNotNull(lookback);

    const stateFor = field => {
        const match = normalized.match(
            new RegExp(`${field}\\s*=\\s*minif\\(TimeGenerated, State == "([^"]+)"\\)`));
        assert.isNotNull(match, field);
        return match[1];
    };
    const windowStartMs = Date.parse(windowStart);
    const windowEndMs = Date.parse(windowEnd);
    const lookbackStartMs = windowStartMs - Number(lookback[1]) * 24 * 60 * 60 * 1000;
    const scopedEvents = events
        .map(event => ({ ...event, time: Date.parse(event.time) }))
        .filter(event => event.time >= lookbackStartMs && event.time <= windowEndMs);
    const firstTime = state => {
        const times = scopedEvents.filter(event => event.state === state).map(event => event.time);
        return times.length ? Math.min(...times) : null;
    };
    const startedTime = firstTime(stateFor('StartedTime'));
    const connectedTime = firstTime(stateFor('ConnectedTime'));
    const endTime = firstTime(stateFor('EndTime'));

    if (connectedTime === null && !(startedTime === null && endTime !== null)) {
        return null;
    }
    const windowedStart = Math.max(connectedTime ?? windowStartMs, windowStartMs);
    const windowedEnd = Math.min(endTime ?? windowEndMs, windowEndMs);
    return windowedEnd > windowedStart
        ? (windowedEnd - windowedStart) / (60 * 60 * 1000)
        : null;
}

function mttfBucketFor(query, totalDurationHours, disruptionCount) {
    const caseBlock = normalizeQuery(query)
        .match(/\| extend MTTFBin = case\(\n([\s\S]*?)\n\)/);
    assert.isNotNull(caseBlock);

    const infinite = caseBlock[1].match(
        /DisruptionCount == 0 or MeanTimeToFailureHours >= ([\d.]+), "([^"]+)"/);
    assert.isNotNull(infinite);
    const thresholds = Array.from(caseBlock[1].matchAll(
        /MeanTimeToFailureHours < ([\d.]+),\s*"([^"]+)"/g));
    const fallback = caseBlock[1].trim().split('\n').at(-1).match(/^"([^"]+)"$/);
    assert.isNotNull(fallback);

    const meanTimeToFailure = disruptionCount > 0
        ? totalDurationHours / disruptionCount
        : 0;
    if (disruptionCount === 0 || meanTimeToFailure >= Number(infinite[1])) {
        return infinite[2];
    }
    const threshold = thresholds.find(match => meanTimeToFailure < Number(match[1]));
    return threshold ? threshold[2] : fallback[1];
}

function multiLinkLabelsFor(query, rows) {
    const normalized = normalizeQuery(query);
    const gatewayUnknown = normalized.match(
        /GatewayLocation = iff\(isempty\(GatewayRegion\) or GatewayRegion == "", "([^"]+)", GatewayRegion\)/);
    const transportUnavailable = normalized.match(
        /TransportCapability = coalesce\(TransportCapability, "([^"]+)"\)/);
    const gatewayUnavailable = normalized.match(
        /GatewayLocation = coalesce\(GatewayLocation, "([^"]+)"\)/);
    assert.isNotNull(gatewayUnknown);
    assert.isNotNull(transportUnavailable);
    assert.isNotNull(gatewayUnavailable);

    if (!rows.length) {
        return {
            transport: transportUnavailable[1],
            gateway: gatewayUnavailable[1]
        };
    }
    return {
        transport: rows[0].transportCapability || 'Other',
        gateway: rows[0].gatewayRegion || gatewayUnknown[1]
    };
}

const items = flattenItems(workbook.items);
const navigationItems = flattenItems(navigationWorkbook.items);
const reliabilityItems = flattenItems(reliabilityWorkbook.items);
const parameters = items.find(item => item.name === 'parameters_general').content.parameters;
const navigationMttfParameterGroups = ['parameters_mttf_filters']
    .map(name => navigationItems.find(item => item.name === name));
const navigationMttfParameters = navigationMttfParameterGroups
    .flatMap(item => item.content.parameters);
const dataViews = items.filter(item => item.type === 3 && item.content.queryType === 0);
const resourceFilter = '| where _ResourceId in~ ({HostPools})';
const gatewayNormalization = '| extend GatewayLocation = iff(isempty(GatewayRegion) or GatewayRegion == "", "Unknown", GatewayRegion)';
const gatewayFilter = "| where '*' in ({GatewayRegion}) or GatewayLocation in ({GatewayRegion})";
// The first two reads select connections for the top gateway filter (_GatewayAllowed, _HasMultiLink).
const gatewayReads = dataViews.flatMap(item =>
    sourcePipelines(item.content.query, 'WVDMultiLinkAdd').slice(2)
        .map((pipeline, index) => ({ name: `${item.name} link read ${index + 1}`, pipeline })));
const windowLets = [
    'let WindowStart = {MTTFTimeRange:start};',
    'let WindowEnd = min_of({MTTFTimeRange:end}, now());',
    'let Lookback = 7d;'
].join('\n');
const timeLookback = '| where TimeGenerated between ((WindowStart - Lookback) .. WindowEnd)';
const timeWindow = '| where TimeGenerated between (WindowStart .. WindowEnd)';
const gatewayFilterLet = "let _FilterGateway = '*' !in ({GatewayRegion});";
const gatewayUnavailableLet =
    "let _GatewayUnavailableSelected = _FilterGateway and 'Unavailable' in ({GatewayRegion});";
const gatewayConnectionFilter = "| where '*' in ({GatewayRegion}) or CorrelationId in (_GatewayAllowed) " +
    'or (_GatewayUnavailableSelected and CorrelationId !in (_HasMultiLink))';
const hasMultiLinkTail =
    [timeLookback, resourceFilter, '| where _GatewayUnavailableSelected', '| distinct CorrelationId'];
const windowedDuration = [
    '| where isnotempty(ConnectedTime) or (isempty(StartedTime) and isnotempty(EndTime))',
    '| extend WindowedStart = max_of(coalesce(ConnectedTime, WindowStart), WindowStart)',
    '| extend WindowedEnd = min_of(coalesce(EndTime, WindowEnd), WindowEnd)',
    '| where WindowedEnd > WindowedStart',
    "| extend DurationHours = datetime_diff('second', WindowedEnd, WindowedStart) / 3600.0"
].join('\n');
const kqlParameters = parameters.filter(parameter => parameter.queryType === 0);
const mttfQueries = [
    ...dataViews.map(item => ({ name: item.name, content: item.content })),
    ...kqlParameters.map(parameter => ({ name: parameter.name, content: parameter }))
];

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
        assert.equal(generalParameters.customWidth, '100');
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

    it('sets every MTTF query range in the query with a lookback for sessions open at the start', () => {
        assert.sameMembers(kqlParameters.map(parameter => parameter.name),
            ['GatewayRegion', 'ClientType', 'ClientVersion']);
        for (const { name, content } of mttfQueries) {
            assert.notProperty(content, 'timeContextFromParameter', name);
            assert.notProperty(content, 'timeContext', name);

            const query = normalizeQuery(content.query);
            assert.equal(query.slice(0, windowLets.length + 1), `${windowLets}\n`, name);
            assert.lengthOf(query.match(/\{MTTFTimeRange\b/g), 2, name);
            for (const [table, timeFilter] of [
                ['WVDConnections', timeLookback],
                ['WVDMultiLinkAdd', timeLookback],
                ['WVDErrors', timeWindow]
            ]) {
                const pipelines = sourcePipelines(query, table);
                assert.lengthOf(pipelines, (query.match(new RegExp(`\\b${table}\\b`, 'g')) || []).length,
                    `${name} ${table}`);
                for (const pipeline of pipelines) {
                    assert.equal(pipeline.split('\n')[0], timeFilter, `${name} ${table}`);
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
            const connections = sourcePipelines(query, 'WVDConnections');
            assert.lengthOf(connections, 1, name);
            assert.include(connections[0], resourceFilter, name);
            assert.include(connections[0].split('\n'), gatewayConnectionFilter, name);
            const lines = normalizeQuery(query).split('\n');
            assert.include(lines, gatewayFilterLet, name);
            assert.include(lines, gatewayUnavailableLet, name);
            assert.deepEqual(letBlock(query, '_HasMultiLink').split('\n').slice(2), hasMultiLinkTail, name);
            if (name === 'ClientVersion') {
                assert.include(connections[0],
                    "| where '*' in ({ClientType}) or ClientType in ({ClientType})", name);
                const aggregationEnd = connections[0].indexOf('by CorrelationId');
                assert.isAtLeast(aggregationEnd, 0, name);
                for (const field of ['ClientType', 'ClientVersion']) {
                    assert.include(connections[0].slice(0, aggregationEnd),
                        `take_anyif(${field}, isnotempty(${field}))`, name);
                }
                assert.isAbove(connections[0].indexOf("| where '*' in ({ClientType})"),
                    aggregationEnd, name);
            }
        }
    });

    for (const item of dataViews) {
        it(`${item.name} applies resource, gateway and client filters to in-range durations`, () => {
            assert.deepEqual(item.content.crossComponentResources, ['{HostPools}']);

            const connections = sourcePipelines(item.content.query, 'WVDConnections');
            assert.lengthOf(connections, 1);
            assert.include(connections[0], resourceFilter);
            assert.include(connections[0].split('\n'), gatewayConnectionFilter);
            const aggregationEnd = connections[0].indexOf('by CorrelationId');
            assert.isAtLeast(aggregationEnd, 0);
            for (const [field, state] of [
                ['StartedTime', 'Started'], ['ConnectedTime', 'Connected'], ['EndTime', 'Completed']
            ]) {
                assert.match(connections[0].slice(0, aggregationEnd),
                    new RegExp(`${field}\\s*=\\s*minif\\(TimeGenerated, State == "${state}"\\)`));
            }
            assert.isAbove(connections[0].indexOf(windowedDuration), aggregationEnd,
                'durations must be clipped to the selected range after correlation');
            assert.lengthOf(connections[0].match(/\bDurationHours\s*=/g), 1);
            assert.notInclude(connections[0], 'isnotempty(ConnectedTime) and isnotempty(EndTime)');
            for (const name of ['ClientType', 'ClientVersion']) {
                const filter = `| where '*' in ({${name}}) or ${name} in ({${name}})`;
                assert.include(connections[0], filter);
                assert.match(connections[0].slice(0, aggregationEnd),
                    new RegExp(`${name}\\s*=\\s*take_anyif\\(${name}, isnotempty\\(${name}\\)\\)`));
                assert.isAbove(connections[0].indexOf(filter), aggregationEnd,
                    `${name} must filter correlated connections, not individual lifecycle events`);
            }

            const gatewaySelection = sourcePipelines(item.content.query, 'WVDMultiLinkAdd')[0];
            assert.include(gatewaySelection, resourceFilter);
            assert.include(gatewaySelection, '| where _FilterGateway');
            assert.include(gatewaySelection,
                '| extend _GR = iff(isempty(GatewayRegion) or GatewayRegion == "", "Unknown", GatewayRegion)');
            assert.include(gatewaySelection, '| where _GR in ({GatewayRegion})');
            assert.include(gatewaySelection, '| distinct CorrelationId');
            const lines = normalizeQuery(item.content.query).split('\n');
            assert.include(lines, gatewayFilterLet);
            assert.include(lines, gatewayUnavailableLet);
            assert.deepEqual(letBlock(item.content.query, '_HasMultiLink').split('\n').slice(2), hasMultiLinkTail);

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

describe('Connection MTTF calculation results', () => {
    const query = items.find(item => item.name === 'MTTFBarChart').content.query;
    const windowStart = '2026-01-10T00:00:00Z';
    const windowEnd = '2026-01-11T00:00:00Z';

    it('clips cross-boundary durations and exercises every lifecycle fallback', () => {
        const cases = [
            {
                name: 'still connected with a Connected event inside the lookback',
                events: [{ state: 'Connected', time: '2026-01-04T00:00:00Z' }],
                expected: 24
            },
            {
                name: 'still connected with its last Connected event outside the lookback',
                events: [{ state: 'Connected', time: '2026-01-02T23:59:59Z' }],
                expected: null
            },
            {
                name: 'completed with earlier lifecycle events outside the lookback',
                events: [
                    { state: 'Started', time: '2026-01-01T00:00:00Z' },
                    { state: 'Connected', time: '2026-01-01T00:01:00Z' },
                    { state: 'Completed', time: '2026-01-10T03:00:00Z' }
                ],
                expected: 3
            },
            {
                name: 'connected before the range and completed inside it',
                events: [
                    { state: 'Connected', time: '2026-01-09T23:00:00Z' },
                    { state: 'Completed', time: '2026-01-10T05:00:00Z' }
                ],
                expected: 5
            },
            {
                name: 'connected inside the range with completion telemetry after the range',
                events: [
                    { state: 'Connected', time: '2026-01-10T02:00:00Z' },
                    { state: 'Completed', time: '2026-01-11T01:00:00Z' }
                ],
                expected: 22
            },
            {
                name: 'only Started telemetry',
                events: [{ state: 'Started', time: '2026-01-10T01:00:00Z' }],
                expected: null
            },
            {
                name: 'completion exactly at the range start',
                events: [{ state: 'Completed', time: windowStart }],
                expected: null
            },
            {
                name: 'no lifecycle telemetry',
                events: [],
                expected: null
            }
        ];

        for (const testCase of cases) {
            const actual = durationHoursFor(query, testCase.events, windowStart, windowEnd);
            if (testCase.expected === null) {
                assert.isNull(actual, testCase.name);
            } else {
                assert.closeTo(actual, testCase.expected, 0.000001, testCase.name);
            }
        }
    });

    it('assigns exact duration boundaries and both Infinite fallbacks to MTTF buckets', () => {
        for (const [totalDurationHours, disruptionCount, expected] of [
            [0, 0, 'Infinite'],
            [0.5, 1, '0 - 1 hrs'],
            [1, 1, '1 - 2 hrs'],
            [2, 1, '2 - 3 hrs'],
            [3, 1, '3 - 4 hrs'],
            [4, 1, '4 - 5 hrs'],
            [5, 1, '5 - 6 hrs'],
            [6, 1, '6 - 7 hrs'],
            [7, 1, '7 - 8 hrs'],
            [8, 1, '8 - 9 hrs'],
            [9, 1, '9 - 10 hrs'],
            [19.999, 2, '9 - 10 hrs'],
            [10, 1, 'Infinite'],
            [20, 2, 'Infinite']
        ]) {
            assert.equal(mttfBucketFor(query, totalDurationHours, disruptionCount), expected,
                `${totalDurationHours} hours / ${disruptionCount} disruptions`);
        }
    });

    it('describes active, completed, unavailable, and unknown telemetry semantics', () => {
        const description = items.find(item => item.name === 'MTTFDescription').content.json;

        assert.include(description,
            'Still-connected sessions are included only when their Connected event is available within the 7-day lookback.');
        assert.include(description,
            'Completed sessions are also included when a Completed event falls in the selected range');
        assert.include(description,
            'Connections without MultiLink telemetry are grouped as **Unavailable**');
        assert.include(description,
            '**Unknown** is reserved for a present MultiLink row with an empty gateway region.');
    });
});

describe('Connection MTTF unavailable MultiLink data', () => {
    const queryOf = name => items.find(item => item.name === name).content.query;
    const transportUnavailable = '| extend TransportCapability = coalesce(TransportCapability, "Unavailable")';
    const gatewayUnavailable = '| extend GatewayLocation = coalesce(GatewayLocation, "Unavailable")';
    const gatewayRowsJoin = '| join kind=leftouter GatewayRows on CorrelationId';

    for (const name of ['MTTFTransportDetail', 'MTTFUnifiedConnections', 'MTTFTransportConnections',
        'MTTFGatewayConnections']) {
        it(`${name} keeps connections without MultiLink rows as Unavailable transport`, () => {
            const lines = finalStatement(queryOf(name)).split('\n');
            const join = lines.findIndex(line => /^\| join kind=leftouter \(?MultiLinkInfo\b/.test(line));
            const coalesce = lines.indexOf(transportUnavailable);

            assert.equal(lines[0], 'SelectedConnections');
            assert.notInclude(lines.join('\n'), 'join kind=inner');
            assert.isAtLeast(join, 0);
            assert.isAbove(coalesce, join);
            if (name === 'MTTFTransportConnections') {
                assert.isBelow(coalesce, lines.indexOf('| where TransportCapability == SelectedTransport'));
            }
        });
    }

    it('MTTFGatewayDetail groups connections without gateway rows as Unavailable', () => {
        const lines = finalStatement(queryOf('MTTFGatewayDetail')).split('\n');
        const join = lines.indexOf(gatewayRowsJoin);

        assert.equal(lines[0], 'SelectedConnections');
        assert.isAtLeast(join, 0);
        assert.isAbove(lines.indexOf(gatewayUnavailable), join);
    });

    it('MTTFGatewayConnections drills into Unavailable gateway connections', () => {
        const lines = letBlock(queryOf('MTTFGatewayConnections'), 'GatewayFiltered').split('\n');
        const join = lines.indexOf(gatewayRowsJoin);
        const coalesce = lines.indexOf(gatewayUnavailable);

        assert.equal(lines[0], 'SelectedConnections');
        assert.isAtLeast(join, 0);
        assert.isAbove(coalesce, join);
        assert.isAbove(lines.indexOf('| where GatewayLocation == SelectedGateway'), coalesce);
    });

    it('distinguishes absent telemetry from a present row with an unknown gateway', () => {
        const query = queryOf('MTTFGatewayConnections');

        assert.deepEqual(multiLinkLabelsFor(query, []), {
            transport: 'Unavailable',
            gateway: 'Unavailable'
        });
        assert.deepEqual(multiLinkLabelsFor(query, [{
            gatewayRegion: '',
            transportCapability: 'Other'
        }]), {
            transport: 'Other',
            gateway: 'Unknown'
        });
        assert.deepEqual(multiLinkLabelsFor(query, [{
            gatewayRegion: 'WUS2',
            transportCapability: 'UDP Shortpath'
        }]), {
            transport: 'UDP Shortpath',
            gateway: 'WUS2'
        });
    });

    it('does not use N/A for unavailable MultiLink data', () => {
        for (const { name, content } of mttfQueries) {
            assert.notInclude(content.query, 'N/A', name);
        }
    });

    it('always offers Unknown and Unavailable in the gateway filter', () => {
        const query = parameters.find(parameter => parameter.name === 'GatewayRegion').query;

        assert.deepEqual(normalizeQuery(query).split('\n').slice(-3), [
            '| union (datatable(GatewayLocation:string)["Unknown", "Unavailable"])',
            '| distinct GatewayLocation',
            '| order by GatewayLocation asc'
        ]);
    });

    it('labels connection durations as time within the selected range', () => {
        for (const name of ['MTTFUnifiedConnections', 'MTTFTransportConnections', 'MTTFGatewayConnections']) {
            const setting = items.find(item => item.name === name).content.gridSettings.labelSettings
                .find(label => label.columnId === 'DurationHours');
            assert.equal(setting?.label, 'Duration in Range (hrs)', name);
        }
    });
});

describe('Connection MultiLink availability', () => {
    for (const [name, workbookItems, expectedQueryCount] of [
        ['MTTF', items, 11],
        ['navigation', navigationItems, 3],
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
