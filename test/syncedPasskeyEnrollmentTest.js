const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

const workbook = JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'Workbooks', 'Azure Active Directory', 'Passwordless',
    'Phishing-Resistant Passwordless.workbook'
), 'utf8'));

function findItem(items, name) {
    for (const item of items) {
        if (item.name === name) return item;
        const nested = item.content && item.content.items && findItem(item.content.items, name);
        if (nested) return nested;
    }
}

describe('Synced passkey enrollment', () => {
    const platforms = [
        { name: 'macOS', prefix: 'macos', minimum: 13, order: ['sekey', 'fido', 'syncedpasskey', 'authapppasskey', 'cba'] },
        { name: 'iOS', prefix: 'ios', minimum: 16, order: ['syncedpasskey', 'authapppasskey', 'fido', 'cba'] },
        { name: 'Android', prefix: 'android', minimum: 9, order: ['syncedpasskey', 'authapppasskey', 'fido', 'cba'] }
    ];
    const selectionNames = new Set();

    for (const { name, prefix, minimum, order } of platforms) {
        const group = findItem(workbook.items, `Group - ${name}`);
        const panel = findItem(group.content.items, `${name} Synced Passkey`);
        const [chart, explanation, table] = panel.content.items;
        const selectionName = `${prefix}SyncedPasskeyReadinessSelected`;
        const chartSuffix = '\n| summarize ObservedRecords = count() by readinessCheck';
        const commonQuery = chart.content.query.slice(0, -chartSuffix.length);

        it(`${name}: adds the ordered credential without changing the original default`, () => {
            assert.deepEqual(group.conditionalVisibility, {
                parameterName: 'OSSelection', comparison: 'isEqualTo', value: name
            });
            assert.deepEqual(panel.conditionalVisibility, {
                parameterName: `${name}Credential`, comparison: 'isEqualTo', value: 'syncedpasskey'
            });
            const tabs = group.content.items.find(item => item.type === 11).content.links;
            assert.deepEqual(tabs.map(link => link.subTarget), order);
            assert.isTrue(tabs.every(link => link.cellValue === `${name}Credential`));
            const parameters = group.content.items.find(item => item.type === 9).content.parameters;
            if (name === 'macOS') {
                assert.equal(tabs[0].subTarget, 'sekey');
            } else {
                assert.equal(parameters.find(parameter => parameter.name === `${name}Credential`).value, 'authapppasskey');
            }
            const selection = parameters.find(parameter => parameter.name === selectionName);
            assert.equal(selection.value, '{"series":"All"}');
            assert.isString(selection.label);
            assert.isFalse(selectionNames.has(selectionName));
            selectionNames.add(selectionName);
        });

        it(`${name}: matches the existing chart, explanation and export layout`, () => {
            assert.deepEqual(panel.content.items.map(item => item.type), [3, 1, 3]);
            assert.equal(chart.customWidth, '50');
            assert.equal(chart.content.size, 3);
            assert.equal(chart.content.visualization, 'piechart');
            assert.isFalse(chart.content.chartSettings.showMetrics);
            assert.isTrue(chart.content.chartSettings.showLegend);
            assert.deepEqual(chart.content.chartSettings.seriesLabelSettings.map(series => [series.seriesName, series.color]),
                [['Ready', 'blue'], ['NotReady', 'redBright'], ['Unknown', 'gray']]);
            assert.equal(explanation.customWidth, '50');
            assert.equal(explanation.content.style, 'info');
            assert.include(explanation.content.json, `# ${name} Synced Passkey Query Explanation`);
            assert.deepEqual(explanation.conditionalVisibility, {
                parameterName: 'Explanation', comparison: 'isNotEqualTo', value: 'Hide'
            });
            assert.notProperty(table, 'customWidth');
            assert.isTrue(table.content.showExportToExcel);
            assert.equal(table.content.visualization, 'table');
            const projection = table.content.query.split('\n| project ').pop().split('\n')[0];
            const columns = projection.split(', ').map(column => column.split(' = ')[0]);
            assert.sameMembers(table.content.gridSettings.labelSettings.map(setting => setting.columnId), columns);
            assert.isTrue(table.content.gridSettings.labelSettings.every(setting => setting.label.length > 0));
        });

        it(`${name}: shares the entire filtered observation query and isolates chart selection to the table`, () => {
            assert.isTrue(chart.content.query.endsWith(chartSuffix));
            assert.isTrue(table.content.query.startsWith(`${commonQuery}\n| extend SelectedReadiness = `));
            for (const item of [chart, table]) {
                assert.equal(item.content.timeContextFromParameter, 'TimeRange');
                assert.deepEqual(item.content.crossComponentResources, ['{Workbook}']);
                assert.equal(item.content.queryType, 0);
                assert.equal(item.content.resourceType, 'microsoft.operationalinsights/workspaces');
            }
            [
                '| where TimeGenerated {TimeRange:value}',
                "| where AppDisplayName in ({Apps}) or '*' in ({Apps})",
                "| where UserDisplayName in ({Users}) or '*' in ({Users})",
                '| where ResultType == "0"',
                '| where CrossTenantAccessType == "none"',
                `| where OSFamily == "${name}"`,
                "| where readinessCheck in ({deviceReadiness}) or '*' in ({deviceReadiness})"
            ].forEach(filter => assert.include(commonQuery, filter));
            assert.equal(chart.content.exportParameterName, selectionName);
            assert.equal(chart.content.exportDefaultValue, '{"series":"All"}');
            assert.notInclude(chart.content.query, selectionName);
            assert.include(table.content.query, `parse_json('{${selectionName}:escape}').series`);
            assert.include(table.content.query, 'isempty(SelectedReadiness) or SelectedReadiness == "All" or readinessCheck == SelectedReadiness');
            assert.notInclude(table.content.query, `{${prefix}ReadinessSelected}`);
        });

        it(`${name}: uses nested native evidence, numeric minima and explicit unknown guards`, () => {
            [
                'ParsedOS = parse_user_agent(UserAgent, "os")',
                'ParsedDevice = parse_user_agent(UserAgent, "device")',
                'tostring(ParsedOS.OperatingSystem.Family)',
                'toint(ParsedOS.OperatingSystem.MajorVersion)',
                'tostring(ParsedDevice.Device.Brand)',
                'tostring(ParsedDevice.Device.Model)',
                'iff(UAPlatform == OSFamily, toint(ParsedOS.OperatingSystem.MajorVersion), int(null))',
                'isnull(OSMajorVersion) or OSMajorVersion <= 0',
                '(OSFamily == "macOS" and OSMajorVersion <= 10)',
                '(OSFamily == "Android" and OSMajorVersion == 10 and DeviceModel =~ "K")',
                'DeviceBrand =~ "Samsung"',
                'DeviceModel matches regex @"(?i)^(SM-|GT-|SCH-|SGH-|SHV-|SHW-|SPH-)"',
                'case(VersionUnknown, "Unknown", OSFamily == "Android" and IsSamsung, "NotReady", OSFamily == "Android" and not(KnownNonSamsungBrand), "Unknown"',
                `OSMajorVersion < ${minimum}, "NotReady", "Ready")`
            ].forEach(fragment => assert.include(commonQuery, fragment));
            assert.notMatch(commonQuery, /parse_user_agent\(UserAgent, "browser"\)|Browser\.|DeviceDetail\.(manufacturer|osVersion)/);
            assert.notMatch(commonQuery, /datatable|datetime\(\d{4}-|https?:|AAGUID|ConditionalAccess/i);
        });

        it(`${name}: counts latest observations rather than names or missing device IDs`, () => {
            assert.include(commonQuery, 'UserKey = case(isnotempty(UserId), strcat("id:", tolower(UserId)), isnotempty(NormalizedUPN), strcat("upn:", NormalizedUPN), "")');
            assert.include(commonQuery, '| where isnotempty(UserKey)');
            assert.include(commonQuery, 'iff(isempty(DeviceId), strcat("unresolved:", OSFamily), strcat("device:", DeviceId))');
            assert.include(commonQuery, '| summarize arg_max(TimeGenerated, *) by UserKey, ObservationKey');
            assert.include(commonQuery, '| project TimeGenerated, UserId, UserPrincipalName, UserDisplayName, DeviceDetail, UserAgent');
            assert.isBelow(commonQuery.indexOf('arg_max('), commonQuery.indexOf('ParsedDevice = parse_user_agent('));
            assert.isBelow(commonQuery.indexOf('arg_max('), commonQuery.indexOf('| extend readinessCheck'));
            assert.isBelow(commonQuery.indexOf('arg_max('), commonQuery.indexOf('| where readinessCheck'));
            assert.notMatch(chart.content.query, /count\(UserDisplayName\)|dcount\(|count\(DeviceId\)/);
            assert.include(explanation.content.json, 'not unique users or a device inventory');
            assert.include(explanation.content.json, 'rows missing both are excluded');
        });
    }

    it('does not add synced-passkey logic to Windows or enforcement', () => {
        const windows = findItem(workbook.items, 'Windows Readiness');
        const enforcement = findItem(workbook.items, 'Enforcement Readiness Phase');
        assert.notMatch(JSON.stringify(windows), /syncedpasskey/i);
        assert.notMatch(JSON.stringify(enforcement), /syncedpasskey/i);
        assert.deepEqual(workbook.items.filter(item => /Readiness Phase$/.test(item.name)).map(item => item.name),
            ['Enrollment Readiness Phase', 'Enforcement Readiness Phase']);
    });
});
