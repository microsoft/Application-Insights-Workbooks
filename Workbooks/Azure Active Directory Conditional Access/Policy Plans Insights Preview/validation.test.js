const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');
const Validator = require('jsonschema').Validator;

const templateDirectory = __dirname;
const repositoryDirectory = path.resolve(templateDirectory, '..', '..', '..');
const communityPrefix = `Community-${path.relative(repositoryDirectory, templateDirectory).split(path.sep).join('/')}/`;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function loadWorkbook(directory) {
    const files = fs.readdirSync(directory).filter(file => file.endsWith('.workbook'));
    assert.lengthOf(files, 1, `Expected one workbook in ${directory}`);
    return { file: path.join(directory, files[0]), workbook: read(path.join(directory, files[0])) };
}

function loadTemplate(id) {
    assert.isTrue(id.startsWith(communityPrefix), `Unexpected template reference: ${id}`);
    return loadWorkbook(path.join(templateDirectory, id.slice(communityPrefix.length)));
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
            assert.strictEqual(parameter.type, inherited.get(parameter.name).type,
                `Inherited parameter ${parameter.name} must use a compatible type`);
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

describe('Opt-in Policy Plans Insights structural validation...', () => {
    it('resolves every lazy dependency locally, without cycles, inline payloads or oversized templates', () => {
        const schema = read(path.join(repositoryDirectory, 'schema', 'workbook.json'));
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
        const entry = loadWorkbook(templateDirectory);
        validate(entry.file, entry.workbook);
    });

    it('resolves parameter references with compatible inherited types, including standalone template editing', () => {
        checkScope(loadWorkbook(templateDirectory).workbook.items);
        for (const directory of fs.readdirSync(templateDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
            const files = fs.readdirSync(path.join(templateDirectory, directory.name)).filter(file => file.endsWith('.workbook'));
            for (const file of files) checkScope(read(path.join(templateDirectory, directory.name, file)).items);
        }
    });

});
