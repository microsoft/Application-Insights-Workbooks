# Defender CSPM workbook

[DefenderCSPM.workbook](./DefenderCSPM.workbook) is the native Defender CSPM gallery template. It retains the secure-score overview, attack-path investigation, and attack-path remediation views, and adds complete subscription-level configuration diagnostics and broader findings views.

## Settings page order

The **Defender CSPM** tab shows plan configurations followed by eight compact **Settings & monitoring** tables, one per component. Each panel shows just **Subscription** and its color-coded **Status**. The first four panels form the first row and the remaining four form the second row. Read left to right, then down, to follow the Defender CSPM Settings page:

| Order | Settings component | Extension API name |
| --- | --- | --- |
| 1 | Agentless scanning for machines | `AgentlessVmScanning` |
| 2 | Kubernetes API access | `AgentlessDiscoveryForKubernetes` |
| 3 | Registry access | `ContainerRegistriesVulnerabilityAssessments` |
| 4 | Sensitive data discovery | `SensitiveDataDiscovery` |
| 5 | Cloud Infrastructure and Entitlements Management (CIEM) | `EntraPermissionsManagement` |
| 6 | API Security Posture Management | `ApiPosture` |
| 7 | Serverless protection | `AgentlessServerlessPosture` |
| 8 | Serverless containers | `ServerlessContainers` |

Each Settings panel uses subscription-level `CloudPosture` configurations only. Each selected Azure subscription remains in every panel even when its plan or extension settings are missing. Settings on shared plans such as Servers, Containers, or Storage cannot turn a disabled CSPM setting green. Resource-level pricing overrides are excluded.

Only an explicit enabled value under a Standard plan is green. Disabled plans, failed or unrecognized enablement operations, conflicting declarations, missing extensions, missing plans, and unknown values have distinct states. **CIEM** is the compact panel title for Cloud Infrastructure and Entitlements Management.

The plan table lists every reported subscription-level pricing plan instead of using a fixed list. Pricing tier, subplan, and reported resource coverage are separate fields; a stale paid subplan cannot make a Free plan appear enabled. Select **Show advanced extension diagnostics** below the panels to load the raw extension inventory. This detail stays hidden until requested and preserves source plans, subplans, exclusions, additional configuration, operation details, and every emitted extension name, including capabilities beyond the eight-component layout. Raw enablement is not proof of effective coverage.

## Findings

The **All findings** tab queries both Resource Graph assessment types:

- `microsoft.security/assessments`: all reported recommendations, including newer individual vulnerability recommendations, risk details, and additional context.
- `microsoft.security/assessments/subassessments`: detailed findings, parent recommendation keys, remediation, resource details, and additional data.

Neither table uses a fixed recommendation-ID or title list, nor does it exclude non-Azure records or healthy, not-applicable, or unknown statuses. Records from connected clouds are included when Defender for Cloud publishes them at the selected subscription scopes. Findings are not attributed to an extension by guessing from recommendation titles.

The server-side status selector defaults to all states and can select unhealthy, healthy, not-applicable, or other/unknown records exactly. The server-side search matches the reported ID and properties. For example, narrow by a resource ID, recommendation name, or vulnerability identifier. Both parameters use the workbook `escape` formatter. The grid's search box filters only rows already returned.

### Completeness and interpretation

- Each table displays at most 1,000 rows. The findings totals are aggregated server-side before the detail limit. Compare totals with displayed rows and narrow subscriptions, assessment status, or the server-side search if needed.
- Each Settings panel has one row per selected Azure subscription and displays at most 1,000 subscriptions. The combined eight-rows-per-subscription table is no longer used. Narrow the scope if a panel or another inventory exceeds its limit.
- No results, a missing extension, or missing severity/risk information does not mean disabled, supported, scanned, or healthy. Verify permissions, scope, reporting delay, configuration, and product availability.
- These are Resource Graph views, not a complete export of the Cloud Security Graph, API inventory, runtime alerts, or every Defender portal finding. API endpoint sensitive-information details and some serverless vulnerability experiences require the relevant product portal.
- Subscription configuration does not establish multicloud connector configuration, effective resource-level settings, entitlement, or scanning success.
- API sensitive-data insights also require Sensitive data discovery. Full Serverless containers features require Registry access. Some initial discovery takes up to 24 hours. Cloud, region, resource, and hosting-tier support varies.
- Additional data can contain sensitive security context. Review access and content before exporting.

See the current [Defender CSPM component requirements](https://learn.microsoft.com/azure/defender-for-cloud/tutorial-enable-cspm-plan#enable-the-components-of-the-defender-cspm-plan), [API posture and findings](https://learn.microsoft.com/azure/defender-for-cloud/enable-api-security-posture), [serverless protection](https://learn.microsoft.com/azure/defender-for-cloud/serverless-protection), [serverless container posture](https://learn.microsoft.com/azure/defender-for-cloud/posture-for-serverless-containers), and [pricing API](https://learn.microsoft.com/rest/api/defenderforcloud/pricings/list).

## Access and validation

Use an account with Reader access to the selected subscription scopes and permission to read the relevant security resources. The workbook only reads data; changing Defender settings or provisioning Azure resources is not required.

Run the focused regression tests from the repository root:

```shell
npx mocha test/defenderCspm.test.js
```

Use [the workbook testing guide](../../../Documentation/Testing.md) to import the template through Advanced Mode. Verify all four tabs, subscription selection, the two rows of four Settings panels, per-component missing/disabled states, the advanced diagnostics button, findings search, totals versus detail rows, and retained attack-path drill-downs. Use an appropriately authorized account and do not publish tenant findings or resource identifiers in screenshots.
