const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('GCP Defender CSPM details', () => {
    const workbook = JSON.parse(fs.readFileSync(path.join(
        'Workbooks', 'Azure Security Center', 'Coverage', 'Coverage.workbook'
    ), 'utf8'));
    const gcp = workbook.items.find(item => item.name === 'GCP').content.items;
    const details = gcp.find(item => item.name === 'queryGcpDetailedCSPM').content;

    it('shows portal settings in order and separates logging state, method and names', () => {
        assert.deepStrictEqual(details.gridSettings.labelSettings.map(label => label.columnId), [
            'id', 'vmScanners', 'dataSensitivityDiscovery', 'ciem',
            'gcpAuditLogIngestion', 'gcpLoggingProvisioning', 'pubSubSubscriptionName',
            'mdcContainersAgentlessDiscoveryK8s', 'mdcContainersImageAssessment'
        ]);
        assert.match(details.query, /offering\.ciemDiscovery\.enableAuditLogIngestion/);
        assert.match(details.query, /offering\.ciem\.gcpAuditLogIngestion\.provisioningType/);
        assert.match(details.query, /logResourceSet\.pubSubSubscriptionName/);
        assert.match(details.query, /dynamic\(\[null\]\)/);
        assert.doesNotMatch(details.query, /resourceNamePrefix/);
    });

    it('keeps unreported status distinct from a provisioning method', () => {
        const format = name => details.gridSettings.formatters.find(column => column.columnMatch === name);
        assert.deepStrictEqual(format('gcpAuditLogIngestion').formatOptions.thresholdsGrid.map(value => value.text), [
            'Enabled', 'Disabled', 'Not reported'
        ]);
        assert.deepStrictEqual(format('gcpLoggingProvisioning').formatOptions.thresholdsGrid.map(value => value.text), [
            'Automatic provisioning', 'Manual provisioning', 'Bring your own', 'Not reported'
        ]);
        assert.strictEqual(format('pubSubSubscriptionName').formatter, 0);
    });
});

describe('GCP Defender Servers details', () => {
    const workbook = JSON.parse(fs.readFileSync(path.join(
        'Workbooks', 'Azure Security Center', 'Coverage', 'Coverage.workbook'
    ), 'utf8'));
    const gcp = workbook.items.find(item => item.name === 'GCP').content.items;
    const details = gcp.find(item => item.name === 'queryGcpDetailedServers').content;

    it('matches the portal rows and summarizes the two Arc extensions', () => {
        assert.deepStrictEqual(details.gridSettings.labelSettings.map(label => label.columnId), [
            'id', 'vmScanners', 'arcAutoProvisioning', 'arcAdditionalExtensions'
        ]);
        assert.match(details.query, /offering\.mdeAutoProvisioning\.enabled/);
        assert.match(details.query, /offering\.vaAutoProvisioning\.enabled/);
        assert.match(details.query, /"2\/2 enabled"/);
        assert.match(details.query, /not reported/);
        assert.doesNotMatch(details.query, /mdeAutoProvisioning =|vaAutoProvisioning =/);
    });

    it('keeps partially reported extensions distinct from disabled values', () => {
        const formatter = details.gridSettings.formatters.find(column => column.columnMatch === 'arcAdditionalExtensions');
        const thresholds = formatter.formatOptions.thresholdsGrid;
        assert(thresholds.some(value => value.thresholdValue === '2/2 enabled' && value.representation === 'turquoise'));
        assert(thresholds.some(value => value.thresholdValue === '1/2 enabled; 1 not reported' && value.representation === 'gray'));
        assert.deepStrictEqual(thresholds.at(-1), {
            operator: 'Default',
            thresholdValue: null,
            representation: 'gray',
            text: 'Not reported'
        });
    });
});

describe('GCP Defender Databases details', () => {
    const workbook = JSON.parse(fs.readFileSync(path.join(
        'Workbooks', 'Azure Security Center', 'Coverage', 'Coverage.workbook'
    ), 'utf8'));
    const gcp = workbook.items.find(item => item.name === 'GCP').content.items;
    const details = gcp.find(item => item.name === 'queryGcpDetailedDatabases - Copy').content;
    const info = workbook.items.find(item => item.name === 'infoText').content.json;

    it('reports connector Arc provisioning and the subscription SQL Servers on Machines plan', () => {
        assert.deepStrictEqual(details.gridSettings.labelSettings.map(label => label.columnId), [
            'id', 'arcAutoProvisioning', 'sqlServersOnMachines'
        ]);
        assert.match(details.query, /offering\.arcAutoProvisioning\.enabled/);
        assert.match(details.query, /microsoft\.security\/pricings/);
        assert.match(details.query, /name =~ "SqlServerVirtualMachines"/);
        assert.match(details.query, /properties\.pricingTier/);
        assert.match(details.query, /join kind=leftouter/);
        assert.match(info, /SQL plan status is subscription-scoped/);
    });

    it('documents why the separate AMA provisioning toggle is not reported', () => {
        assert.doesNotMatch(details.query, /azure.?monitor.?agent/i);
        assert.match(info, /Azure Monitoring Agent for SQL server on machines/);
        assert.match(info, /no verified Resource Graph source in this workbook/);
        const formatter = details.gridSettings.formatters.find(column => column.columnMatch === 'sqlServersOnMachines');
        assert(formatter.formatOptions.thresholdsGrid.some(value => value.text === 'Not reported'));
    });
});
