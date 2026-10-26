const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

describe('Validating SDK Stats filters...', () => {
    const workbookPath = path.join('Workbooks', 'SDKStats', 'Success Count', 'SDKStats.workbook');
    const versionFilter = "| where isempty('{SdkVersion}') or '{SdkVersion}' == 'All' or sdkVersion == '{SdkVersion}'";

    ['Successful', 'Failed'].forEach(outcome => {
        [['request_data', 'requests'], ['dependency_data', 'dependencies']].forEach(([variable, table]) => {
            it(`${outcome} ${table} filter by sdkVersion with empty/All bypasses`, () => {
                const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));
                const chart = workbook.items.find(item => item.name === `${outcome} Telemetry Chart`);
                assert.exists(chart, `${outcome} Telemetry Chart must exist`);
                assert.include(chart.content.query,
                    `let ${variable} = ${table}\n${versionFilter}\n| where success == ${outcome === 'Successful'}`);
            });
        });

        it(`${outcome} dropped telemetry uses case-insensitive equality without defaulting missing values`, () => {
            const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));
            const chart = workbook.items.find(item => item.name === `${outcome} Telemetry Chart`);
            assert.exists(chart, `${outcome} Telemetry Chart must exist`);
            assert.include(chart.content.query, [
                'let dropped_data = customMetrics',
                '| where name in ("preview.item.dropped.count", "Item_Dropped_Count")',
                versionFilter,
                '| extend telemetry_success = tostring(coalesce(customDimensions["telemetrySuccess"], customDimensions["telemetry_success"]))',
                '| extend telemetry_type = tostring(coalesce(customDimensions["telemetryType"], customDimensions["telemetry_type"]))',
                '| where telemetry_type in ("DEPENDENCY", "REQUEST")',
                `| where telemetry_success =~ "${outcome === 'Successful'}"`,
                '| summarize dropped_count = sum(todouble(value)) by bin(timestamp, {TimeRange:grain});'
            ].join('\n'));
        });
    });
});
