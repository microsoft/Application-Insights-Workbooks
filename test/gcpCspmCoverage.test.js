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
