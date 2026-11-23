const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('Defender for AI Services coverage', () => {
    const workbook = JSON.parse(fs.readFileSync(path.join(
        'Workbooks', 'Azure Security Center', 'Coverage', 'Coverage.workbook'
    ), 'utf8'));
    const azure = workbook.items.find(item => item.name === 'Azure').content.items;
    const get = name => azure.find(item => item.name === name);

    it('includes subscription-level AI pricing in relative and absolute coverage', () => {
        const numbers = get('Azure numbers').content.query;
        const absolute = get('queryAzure').content;
        for (const query of [numbers, absolute.query]) {
            assert.match(query, /name !~ "AI" or id =~ strcat\("\/subscriptions\/", subscriptionId/);
            assert.match(query, /case\(name =~ "AI", pricingTier/);
            assert.match(query, /AI = defenderPlans\.AI/);
        }
        assert.match(numbers, /AI = countif\(AI == "Standard"\)/);
        const relative = get('Azure percentage').content;
        const merge = JSON.parse(relative.query).projectRename;
        assert(merge.some(column => column.originalName === '[Azure numbers].AI' && column.mergedName === 'AI'));
        const percentage = merge.find(column => column.mergedName === 'AI1');
        assert.strictEqual(percentage.newItemData[0].criteriaContext.resultVal, '["AI"]/["totalSubs"]*100');
        assert(relative.gridSettings.formatters.some(column => column.columnMatch === 'AI1' && column.formatter === 8));
        assert(absolute.gridSettings.formatters.some(column => column.columnMatch === 'AI' && column.formatter === 18));
        assert(absolute.gridSettings.labelSettings.some(column => column.columnId === 'AI' && column.label === 'AI Services'));
    });

    it('reports both components without treating missing values as disabled', () => {
        const choices = JSON.parse(workbook.items.find(item => item.name === 'planNames').content.parameters[0].jsonData);
        assert(choices.some(choice => choice.value === 'AI'));
        const detail = get('queryAzureDetailedAI');
        assert(detail.conditionalVisibilities.some(condition => condition.parameterName === 'planName' && condition.value === 'AI'));
        const query = detail.content.query;
        assert.match(query, /name =~ "AI"/);
        assert.match(query, /id =~ strcat\("\/subscriptions\/", subscriptionId/);
        assert.match(query, /tostring\(properties\.pricingTier\) =~ "Standard"/);
        assert.match(query, /array_length\(properties\.extensions\) > 0/);
        for (const name of ['AIPromptEvidence', 'AIModelScanner']) {
            assert(query.includes(`${name} = case(tolower(tostring(extensions.${name})) == "true", "True", tolower(tostring(extensions.${name})) == "false", "False", "Unknown")`));
            const formatter = detail.content.gridSettings.formatters.find(column => column.columnMatch === name);
            assert.deepStrictEqual(formatter.formatOptions.thresholdsGrid.map(value => value.text), ['Enabled', 'Disabled', 'Not reported']);
            assert(detail.content.gridSettings.labelSettings.some(column => column.columnId === name));
        }
    });
});
