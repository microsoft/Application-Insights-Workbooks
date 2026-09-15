const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TABLE = 'IoTEdgeMetrics_CL';
const TABLE_PATTERN = /^(?:|[A-Za-z][A-Za-z0-9_]*_CL)$/;
const BEGIN = '// BEGIN IoT Edge migration normalization\n';
const END = '// END IoT Edge migration normalization\n';
const TABLE_CALL = "table('{MetricsTableNameEffective:escape}')";
// These expected digests come from base commit
// 359e102e9823a25f39674572d82dfa2b786376fc. They lock the retained metric
// bodies against future drift; the independent review also compared base to head.
const FILES = {
  'Workbooks/IoTHub/IoT Edge/IoT Edge.workbook': [2, '2241cb94444bf1a6341739aeb40b4dd0b0a66ad02ded82864588b47257938198'],
  'Workbooks/IoTHub/IoT Edge device details/IoT Edge device details.workbook': [47, '3158ad77ef4a36017fddea9f34b9006a9135bb542ef6cbeb7d609eaf5b508ee3'],
  'Workbooks/IoTHub/IoT Edge health snapshot/IoT Edge health snapshot.workbook': [7, '236be743f2fd53c662a614467d8efcf41ae06b3637d0eee1d7d075700c82dc12'],
  'Workbooks/IoTHub/IoT Edge fleet alerts/IoT Edge fleet alerts.workbook': [0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  'Workbooks/IoT Central/IoT Edge Fleet view/IoT Edge Fleet view.workbook': [2, '2241cb94444bf1a6341739aeb40b4dd0b0a66ad02ded82864588b47257938198'],
  'Workbooks/IoT Central/IoT Edge device details/IoT Edge device details.workbook': [47, '2cb080f1acb525dc79395a386522a40d952393a70858fb80686fc07fb3cbe526'],
  'Workbooks/IoT Central/IoT Edge health snapshot/IoT Edge health snapshot.workbook': [7, '236be743f2fd53c662a614467d8efcf41ae06b3637d0eee1d7d075700c82dc12']
};

function walk(value, output) {
  output = output || [];
  if (Array.isArray(value)) {
    value.forEach(item => walk(item, output));
  } else if (value && typeof value === 'object') {
    output.push(value);
    Object.keys(value).forEach(key => walk(value[key], output));
  }
  return output;
}

function documents() {
  return Object.keys(FILES).map(relativePath => ({
    relativePath,
    document: JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'))
  }));
}

function parameters(document) {
  return walk(document).filter(item => item.version === 'KqlParameterItem/1.0' && item.name);
}

function normalizedQueries(document) {
  return walk(document).filter(item => typeof item.query === 'string' && item.query.indexOf(BEGIN) !== -1);
}

function effectiveTable(input) {
  return typeof input === 'string' && /^[A-Za-z][A-Za-z0-9_]*_CL$/.test(input) ? input : DEFAULT_TABLE;
}

function metricState(mode, cutoverIsValid, legacyRows, newRows) {
  if (['Legacy', 'New', 'Cutover'].indexOf(mode) === -1 || (mode === 'Cutover' && !cutoverIsValid)) {
    return 'InvalidCutover';
  }
  if (legacyRows > 0 && newRows > 0) return 'Transition';
  if (legacyRows > 0) return 'LegacyOnly';
  if (newRows > 0) return 'NewOnly';
  return 'Empty';
}

describe('IoT Edge custom metrics table contract', function () {
  it('declares one visible validated table parameter and one hidden fallback in all seven templates', function () {
    documents().forEach(({relativePath, document}) => {
      const declared = parameters(document);
      const visible = declared.filter(item => item.name === 'MetricsTableName');
      const effective = declared.filter(item => item.name === 'MetricsTableNameEffective');
      assert.strictEqual(visible.length, 1, relativePath);
      assert.strictEqual(effective.length, 1, relativePath);
      assert.strictEqual(visible[0].type, 1, relativePath);
      assert.strictEqual(visible[0].value, DEFAULT_TABLE, relativePath);
      assert.strictEqual(visible[0].isRequired, false, relativePath);
      assert.strictEqual(visible[0].isHiddenWhenLocked, false, relativePath);
      assert.deepStrictEqual(visible[0].typeSettings.paramValidationRules, [{
        regExp: '^(?:|[A-Za-z][A-Za-z0-9_]*_CL)$',
        match: true,
        message: 'Enter a table name that starts with a letter, contains only letters, numbers, or underscores, and ends with _CL.'
      }], relativePath);
      assert.strictEqual(effective[0].isHiddenWhenLocked, true, relativePath);
      assert.strictEqual(effective[0].criteriaData[0].criteriaContext.operator, 'is Empty', relativePath);
      assert.strictEqual(effective[0].criteriaData[0].criteriaContext.resultVal, DEFAULT_TABLE, relativePath);
      const rules = effective[0].criteriaData.map(rule => rule.criteriaContext);
      assert.strictEqual(rules[1].leftOperand, 'MetricsTableName', relativePath);
      assert.strictEqual(rules[1].operator, 'regex', relativePath);
      assert.strictEqual(rules[1].rightVal, '^[A-Za-z][A-Za-z0-9_]*_CL$', relativePath);
      assert.strictEqual(rules[1].resultValType, 'param', relativePath);
      assert.strictEqual(rules[1].resultVal, 'MetricsTableName', relativePath);
      assert.strictEqual(rules[2].operator, 'Default', relativePath);
      assert.strictEqual(rules[2].resultValType, 'static', relativePath);
      assert.strictEqual(rules[2].resultVal, DEFAULT_TABLE, relativePath);
    });
  });

  it('uses the safe default for omitted, cleared, and default input, and accepts an alternate custom table', function () {
    assert.strictEqual(effectiveTable(undefined), DEFAULT_TABLE);
    assert.strictEqual(effectiveTable(''), DEFAULT_TABLE);
    assert.strictEqual(effectiveTable(DEFAULT_TABLE), DEFAULT_TABLE);
    assert.strictEqual(effectiveTable('ContosoEdgeMetrics_CL'), 'ContosoEdgeMetrics_CL');
    assert.strictEqual(effectiveTable("IoTEdgeMetrics_CL') | take 1; //"), DEFAULT_TABLE);
    assert.strictEqual(effectiveTable('not-a-table'), DEFAULT_TABLE);
  });

  it('rejects invalid and malicious table identifiers before query substitution', function () {
    ['', DEFAULT_TABLE, 'Contoso2_EdgeMetrics_CL'].forEach(value => assert(TABLE_PATTERN.test(value), value));
    [
      'InsightsMetrics',
      'IoTEdgeMetrics',
      '2IoTEdgeMetrics_CL',
      'IoT-EdgeMetrics_CL',
      "IoTEdgeMetrics_CL') | take 1; //",
      'IoTEdgeMetrics_CL | union Heartbeat',
      'IoTEdgeMetrics_CL\nHeartbeat'
    ].forEach(value => assert.strictEqual(TABLE_PATTERN.test(value), false, value));
  });

  it('uses a constant escaped table() string in every new-table query and keeps legacy fixed', function () {
    let count = 0;
    documents().forEach(({relativePath, document}) => {
      normalizedQueries(document).forEach(item => {
        const query = item.query;
        count += 1;
        assert(query.indexOf(TABLE_CALL) !== -1, relativePath + ':' + (item.name || 'query'));
        assert(query.indexOf("SourceTable = '{MetricsTableNameEffective:escape}'") !== -1, relativePath);
        assert(query.indexOf('\n    InsightsMetrics\n') !== -1, relativePath);
        assert(query.indexOf('\n    IoTEdgeMetrics_CL\n') === -1, relativePath);
        assert(query.indexOf('let EdgeNew = union isfuzzy=true') !== -1, relativePath);
        assert(query.indexOf('(datatable(TimeGenerated:datetime, Origin:string, Name:string, Value:real, Tags:string, ResourceId:string) [])') < query.indexOf(TABLE_CALL), relativePath);
        assert(query.indexOf('EdgeMode == "Legacy"') !== -1, relativePath);
        assert(query.indexOf('EdgeMode == "New"') !== -1, relativePath);
        assert(query.indexOf('EdgeMode == "Cutover"') !== -1, relativePath);
      });
    });
    assert.strictEqual(count, 118);
  });

  it('substitutes only a validated alternate table name', function () {
    const query = normalizedQueries(documents()[0].document)[0].query;
    const alternate = 'ContosoEdgeMetrics_CL';
    assert(TABLE_PATTERN.test(alternate));
    const rendered = query.replace(/\{MetricsTableNameEffective:escape\}/g, alternate);
    assert(rendered.indexOf("table('ContosoEdgeMetrics_CL')") !== -1);
    assert(rendered.indexOf("SourceTable = 'ContosoEdgeMetrics_CL'") !== -1);
    assert(rendered.indexOf("table('IoTEdgeMetrics_CL')") === -1);
  });

  it('preserves missing-table union semantics and distinguishes empty results from query failure', function () {
    documents().forEach(({relativePath, document}) => {
      normalizedQueries(document).forEach(item => {
        assert(item.query.indexOf('union isfuzzy=true') !== -1, relativePath);
        assert(item.query.indexOf('datatable(TimeGenerated:datetime') !== -1, relativePath);
      });
      parameters(document).filter(item => item.name === 'MetricsDataState').forEach(item => {
        assert(item.query.indexOf('NewRows > 0, "NewOnly", "Empty"') !== -1, relativePath);
        assert(item.description.indexOf('query errors') !== -1, relativePath);
        assert(item.description.indexOf('does not mean no metrics exist') !== -1, relativePath);
      });
    });
    assert.strictEqual(metricState('New', true, 0, 0), 'Empty');
    assert.strictEqual(metricState('Legacy', true, 0, 0), 'Empty');
    assert.strictEqual(metricState('Cutover', true, 0, 0), 'Empty');
    // A query failure produces no MetricsDataState value. It is not modeled as Empty.
    assert.strictEqual(metricState('QueryFailure', true, 0, 0), 'InvalidCutover');
  });

  it('retains Legacy, New, and Cutover state behavior', function () {
    assert.strictEqual(metricState('Legacy', true, 1, 0), 'LegacyOnly');
    assert.strictEqual(metricState('New', true, 0, 1), 'NewOnly');
    assert.strictEqual(metricState('Cutover', true, 1, 1), 'Transition');
    assert.strictEqual(metricState('Cutover', false, 1, 1), 'InvalidCutover');
  });

  it('passes the selected table through all nine workbook destinations, including Fleet Alerts', function () {
    let links = 0;
    let fleetAlertLinks = 0;
    documents().forEach(({relativePath, document}) => {
      walk(document).forEach(item => {
        const context = item.workbookContext;
        if (!context || !context.passSpecificParams || !/^Community-Workbooks\/IoT/.test(context.templateId || '')) return;
        links += 1;
        if (/fleet alerts/i.test(relativePath)) fleetAlertLinks += 1;
        const matches = context.templateParameters.filter(parameter => parameter.name === 'MetricsTableName');
        assert.deepStrictEqual(matches, [{name: 'MetricsTableName', source: 'parameter', value: 'MetricsTableName'}], relativePath);
      });
    });
    assert.strictEqual(links, 9);
    assert.strictEqual(fleetAlertLinks, 1);
  });

  it('preserves all 112 metric calculation bodies byte for byte', function () {
    let total = 0;
    documents().forEach(({relativePath, document}) => {
      const bodies = normalizedQueries(document)
        .filter(item => item.name !== 'MetricsDataState')
        .map(item => item.query.split(END)[1])
        .sort();
      const digest = crypto.createHash('sha256').update(bodies.join('\0')).digest('hex');
      assert.strictEqual(bodies.length, FILES[relativePath][0], relativePath);
      assert.strictEqual(digest, FILES[relativePath][1], relativePath);
      total += bodies.length;
    });
    assert.strictEqual(total, 112);
  });
});
