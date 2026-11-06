const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

describe('Defender CSPM finding timestamps', () => {
    const workbookPath = path.join('Workbooks', 'Azure Security Center', 'Defender CSPM', 'DefenderCSPM.workbook');
    const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));

    function findItems(items, name) {
        return items.flatMap(item => [
            ...(item.name === name ? [item] : []),
            ...findItems(item.content.items || [], name)
        ]);
    }

    [
        ['all_recommendations', ['FirstEvaluated']],
        ['selected_recommendation_context', ['FirstEvaluated', 'TimeGenerated']],
        ['detailed_findings', ['FirstEvaluated', 'TimeGenerated']],
        ['selected_finding_context', ['FirstEvaluated', 'TimeGenerated']]
    ].forEach(([name, columns]) => {
        it(`${name} displays reported datetime columns in UTC`, () => {
            const matches = findItems(workbook.items, name);
            assert.lengthOf(matches, 1, `${name} must exist exactly once`);
            const { query, gridSettings } = matches[0].content;

            columns.forEach(column => {
                assert.match(query, new RegExp(`\\b${column}\\s*=\\s*todatetime\\(`));
                const formatters = gridSettings.formatters.filter(format => format.columnMatch === column);
                assert.lengthOf(formatters, 1, `${name}.${column} must have one formatter`);
                assert.strictEqual(formatters[0].formatter, 6);
                assert.strictEqual(formatters[0].dateFormat.showUtcTime, true);
                assert.strictEqual(formatters[0].dateFormat.formatName, 'shortDateTimePattern');
                const labels = gridSettings.labelSettings.filter(label => label.columnId === column);
                assert.lengthOf(labels, 1, `${name}.${column} must have one label`);
                assert.match(labels[0].label, /\(UTC\)$/);
            });
        });
    });
});
