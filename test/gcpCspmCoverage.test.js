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
