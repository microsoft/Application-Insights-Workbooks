const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');
const Validator = require('jsonschema').Validator;

const templateDirectory = path.join('Workbooks', 'Azure Active Directory Conditional Access', 'Policy Plans Insights Preview');
const communityPrefix = 'Community-Workbooks/Azure Active Directory Conditional Access/Policy Plans Insights Preview/';
const entryFile = path.join(templateDirectory, 'PolicyPlansInsights.workbook');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function loadTemplate(id) {
    assert.isTrue(id.startsWith(communityPrefix), `Unexpected template reference: ${id}`);
    const directory = path.join(templateDirectory, id.slice(communityPrefix.length));
    const files = fs.readdirSync(directory).filter(file => file.endsWith('.workbook'));
    assert.lengthOf(files, 1, `Expected one workbook in ${directory}`);
    return { file: path.join(directory, files[0]), workbook: read(path.join(directory, files[0])) };
}

function visit(items, callback) {
    for (const item of items) {
        callback(item);
        if (item.content && item.content.items) visit(item.content.items, callback);
    }
}

function scopeParameters(items) {
    return items.flatMap(item => {
        if (item.type === 9) return item.content.parameters;
        if (item.content && item.content.exportParameters) return scopeParameters(item.content.items || []);
        return [];
    });
}

function checkScope(items, inherited = new Map()) {
    const scope = new Map(inherited);
    for (const parameter of scopeParameters(items)) {
        if (inherited.has(parameter.name)) {
            assert.deepEqual(parameter, inherited.get(parameter.name),
                `Inherited parameter ${parameter.name} must merge without changing its definition`);
        }
        scope.set(parameter.name, parameter);
    }
    for (const item of items) {
        const { items: children, ...content } = item.content || {};
        const text = JSON.stringify({ ...item, content });
        const references = [...text.matchAll(/\{([A-Za-z_]\w*)(?=[:}])/g)].map(match => match[1]);
        if (item.conditionalVisibility) references.push(item.conditionalVisibility.parameterName);
        if (content.timeContextFromParameter) references.push(content.timeContextFromParameter);
        if (content.exportParameterName) references.push(content.exportParameterName);
        if (item.type === 11) {
            references.push(...content.links.filter(link => link.linkTarget === 'parameter').map(link => link.cellValue));
        }
        for (const reference of references) {
            assert.isTrue(scope.has(reference), `${item.name}: parameter ${reference} is not in scope`);
        }
        if (content.groupType === 'template') checkScope(loadTemplate(content.loadFromTemplateId).workbook.items, scope);
        else if (children) checkScope(children, scope);
    }
}

describe('Validating Policy Plans Insights lazy loading...', () => {
    it('keeps the existing tabs in one small entry workbook and loads only the selected tab', () => {
        const workbook = read(entryFile);
        assert.isBelow(fs.statSync(entryFile).size, 20000, 'The entry workbook should contain only shared controls and navigation');
        const tabs = workbook.items.find(item => item.name === 'Workbook tabs').content;
        assert.equal(tabs.style, 'tabs');
        assert.deepEqual(tabs.links.map(link => [link.linkLabel, link.cellValue, link.subTarget]), [
            ['User sign-ins', 'identityType', 'user'],
            ['Service principal sign-ins', 'identityType', 'servicePrincipal'],
            ['Compare CA to policy plans (Preview)', 'identityType', 'comparison']
        ]);
        const groups = workbook.items.filter(item => item.content.groupType === 'template');
        assert.lengthOf(groups, tabs.links.length);
        for (const tab of tabs.links) {
            const group = groups.find(item => item.conditionalVisibility.value === tab.subTarget);
            assert.exists(group, `Missing content for ${tab.linkLabel}`);
            assert.deepEqual(group.conditionalVisibility, {
                parameterName: 'identityType', comparison: 'isEqualTo', value: tab.subTarget
            });
            assert.equal(group.content.loadType, 'lazy');
        }
        assert.isFalse(workbook.items.some(item => item.type === 3), 'Tab charts must not be embedded in the entry workbook');
    });

    it('resolves every lazy dependency locally, without cycles, inline payloads or oversized templates', () => {
        const schema = read(path.join('schema', 'workbook.json'));
        const validator = new Validator();
        const visited = new Set();
        function validate(file, workbook, ancestors = []) {
            assert.notInclude(ancestors, file, 'Template references must not form a cycle');
            if (visited.has(file)) return;
            visited.add(file);
            assert.isBelow(fs.statSync(file).size, 200000, `${file} should remain below 200 KB`);
            assert.isEmpty(validator.validate(workbook, schema).errors, `${file} must match the workbook schema`);
            visit(workbook.items, item => {
                if (item.content && item.content.groupType === 'template') {
                    assert.equal(item.content.loadType, 'lazy', `${item.name} should load on demand`);
                    assert.notProperty(item.content, 'items', `${item.name} should not embed the referenced template`);
                    const dependency = loadTemplate(item.content.loadFromTemplateId);
                    validate(dependency.file, dependency.workbook, [...ancestors, file]);
                }
            });
        }
        validate(entryFile, read(entryFile));
    });

    it('preserves inherited filter and interaction parameters, including standalone template editing', () => {
        checkScope(read(entryFile).items);
        for (const directory of fs.readdirSync(templateDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
            const files = fs.readdirSync(path.join(templateDirectory, directory.name)).filter(file => file.endsWith('.workbook'));
            for (const file of files) checkScope(read(path.join(templateDirectory, directory.name, file)).items);
        }
    });

    it('keeps comparison breakdowns collapsed and preserves independent side-by-side selection controls', () => {
        const comparison = loadTemplate(`${communityPrefix}Comparison`).workbook;
        const breakdowns = comparison.items.find(item => item.name === 'Show breakdowns');
        assert.isTrue(breakdowns.content.expandable);
        assert.isFalse(breakdowns.content.expanded);
        for (const selection of ['A', 'B']) {
            const group = breakdowns.content.items.find(item => item.name === `Selection ${selection} breakdowns`);
            assert.equal(group.customWidth, '50');
            assert.equal(group.content.loadType, 'lazy');
            const template = loadTemplate(group.content.loadFromTemplateId).workbook;
            const control = template.items.find(item => item.name === `Selection ${selection} device visualization`);
            assert.equal(control.content.parameters[0].name, `DeviceDimension${selection}`);
            const chart = template.items.find(item => item.name === `Selection ${selection} - Device`);
            assert.include(chart.content.query, `{DeviceDimension${selection}:`);
        }
        const users = loadTemplate(`${communityPrefix}Users`).workbook;
        const details = users.items.find(item => item.name === 'user details');
        assert.isTrue(details.content.exportParameters, 'Detail selection exports must remain visible to the reporting tab');
    });
});
