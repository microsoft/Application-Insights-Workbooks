# PHP2SHELL exposure and investigation

A read-only Azure Monitor workbook in **Defender for Cloud > Workbooks >
Community**, beside **Log4j Vulnerability**. Organization overview and environment
tabs combine visible evidence over the selected tenant/subscription scope; the
workload selector narrows the shared recommendation views. This is not a census
of an entire organization. The existing Log4j workbook is unchanged.

## Open the workbook

Before gallery publication, open an empty Azure Monitor workbook, choose
**Edit > Advanced Editor**, paste [PHP2SHELL.workbook](PHP2SHELL.workbook), and
select **Apply**. Review the always-visible prerequisite table before selecting
subscriptions or optional collected sources. Saving your own workbook is optional;
opening this template does not enable plans, ingestion, agents, or WAF rules.

After the contribution is merged and deployed by the gallery maintainers, select
**PHP2SHELL Exposure and Investigation** in the Azure Security Center community
gallery. A repository change alone does not publish to the Azure portal.

## Included views

| Surface | Contents |
| --- | --- |
| Organization overview (default) | Combined recommendation/CVE summary, one findings table, broader posture evidence, discovered connectors, Azure anchor plan/component evidence and machine inventory gaps. |
| Azure, AWS, GCP, Hybrid / Arc, DevOps, Other / external | The same findings/posture surface narrowed by reported native provenance and workload. Unknown and external sources remain visible rather than inheriting the Azure hosting subscription. |
| Unified findings | Exact advisory CVEs in current individual recommendations; tenant-scoped CVE enrichment; scanner/per-CVE version evidence, image/repository context, risk and native finding links. |
| Connectors and coverage | Connector discovery independent of finding volume, explicit Free/Standard/Not reported plan evidence, disconnected Arc inventory and software-inventory gaps. Discovery is not successful scan evidence. |
| Additional inventory and hunting (off by default) | Retained Machines, Containers, Web apps/exposure, DevOps, Alerts/hunting and Response/verification sections. These independent sources have explicit subscription/workspace scope exceptions. |

### Lessons applied from the Log4j update

The comparison used
[microsoft/Application-Insights-Workbooks#3259](https://github.com/microsoft/Application-Insights-Workbooks/pull/3259)
at commit `7b451ec02554136ebeceb57a7487a0403b65a12f`, including its
[scanner-version review comment](https://github.com/microsoft/Application-Insights-Workbooks/pull/3259#discussion_r4418079573).

| Lesson | PHP2SHELL change |
| --- | --- |
| Start with the organization/environment, not overlapping scanner/workload findings tables. | Use seven environment tabs and one shared recommendation classifier, summary and findings table. Retain the detailed PHP investigation sections behind an explicit opt-in. |
| Azure anchor subscriptions are not native cloud provenance or external entitlements. | Use reported source, connector platform and Arc cloud metadata; known AWS/GCP takes precedence over Arc representation. Unresolved/external metadata remains Other. |
| A connector can exist without vulnerability findings. | Discover connectors from ARM independently of assessment volume and preserve empty offerings. Export offering names, not raw payloads or assumed health. |
| The current model is individual assessments with global CVE metadata. | Remove deprecated grouped queries; use SoftwareUpdate/ServiceUpgrade and a tenant-scoped deduplicated CVE left join with explicit assessment/resource subscription filters. |
| Missing inventory/risk/plan metadata is not a successful scan. | Retain unknown states and disconnected Arc machines; exclude known AKS node resource groups from the machine-gap view. No paid-plan condition gates visible findings. |
| Top-level version fields are not sufficient. | Preserve labeled assessment, MDVM and alternate-scanner fallbacks, and prefer the individual CVE's FixedVersion after CVE expansion. |

Log4j-specific CVEs, Java/JAR support claims and broad Log4j package matching were
**not** copied. PHP2SHELL attribution remains restricted to its two advisory CVEs.
The PHP interpreter, Composer dependencies, source constraints, posture, WAF
mitigation and runtime behavior remain different evidence classes. Repository
template validation and opt-in telemetry/privacy boundaries are retained.

The existing PHP2SHELL review comments were also addressed: DevOps matching uses
the provider-qualified security-connector hierarchy rather than any `/devops/`
segment; Front Door diagnostic categories match classic and Standard/Premium
case variants; and collected endpoint queries bind Log Analytics `TimeGenerated`
rather than assuming native XDR's time schema.

The target advisory identifiers are **CVE-2026-109618** and **CVE-2026-109619**.
The workbook links the public
[Microsoft PHP2SHELL response article](https://techcommunity.microsoft.com/blog/azurenetworksecurityblog/addressing-php2shell-cve-2026-109618-and-cve-2026-109619-upgrade-guidance-and-az/4566623),
[Microsoft WAF guidance](https://techcommunity.microsoft.com/blog/azurenetworksecurityblog/azure-waf-custom-rules-for-php2shell-mitigation/4566684),
and primary PHP advisories at the top. It does not invent a dedicated Defender
recommendation, alert, or exploit signature.

## Data prerequisites and limits

- **Inventory:** readable subscriptions/resources and Azure Resource Graph access.
  ARM candidates do not prove PHP is installed, vulnerable, running, or reachable.
  Unconnected assets, Kubernetes pods, package contents, custom builds, and
  unreported runtime configuration require separate inventory.
- **Machine scanning:** a supported Defender for Cloud vulnerability-assessment
  path. Agentless scanning requires Defender CSPM or Defender for Servers Plan 2
  and the applicable component/permissions. See
  [agentless machine scanning](https://learn.microsoft.com/azure/defender-for-cloud/concept-agentless-data-collection).
- **Container findings:** Defender for Containers or supported Defender CSPM
  scenarios, Registry access and applicable runtime discovery/sensor settings.
  See [container vulnerability management](https://learn.microsoft.com/azure/defender-for-cloud/agentless-vulnerability-assessment-azure).
- **Advanced posture:** Defender CSPM and applicable connectors/scanners for
  explorer, attack paths, and code-to-cloud context. Subscription configuration
  does not resolve resource overrides or connected-cloud effective coverage.
- **Serverless applicability:** eligible
  [Serverless protection](https://learn.microsoft.com/azure/defender-for-cloud/serverless-protection)
  and [Serverless Containers](https://learn.microsoft.com/azure/defender-for-cloud/posture-for-serverless-containers)
  require their supported Defender CSPM components, permissions and platforms;
  full Serverless Containers features require Registry access. Verify
  portal-specific package assessment and exclusions without weakening network
  controls. Package/image posture is not a promise of PHP-interpreter inventory,
  complete runtime-layer assessment or EDR.
- **DevOps:** a supported connector, repository permissions and completed scans.
  Not all foundational DevOps inventory/findings require paid Defender CSPM.
  Scanner/platform/language support and licensing differ. Composer packages and
  constraints are not the deployed PHP interpreter. See
  [DevOps prerequisites](https://learn.microsoft.com/azure/defender-for-cloud/devops-support)
  and [SBOM queries](https://learn.microsoft.com/azure/defender-for-cloud/query-software-bill-of-materials).
- **Workload alerts:** relevant Defender workload protection and sensors.
  CSPM posture is not a substitute for runtime protection.
- **Optional logs:** select an existing collected source and readable workspace.
  The source selector defaults to **Do not query optional logs** and the workspace
  selector has no default resource. Diagnostic settings, AMA/DCRs, Container
  Insights, continuous export and Sentinel raw-event integrations must be set up
  separately as described in the workbook. Use supported Analytics table plans
  for these queries. Missing tables and access failures are explicit errors,
  not zero-result fallbacks.
- **Defender XDR TVM:** software inventory/vulnerability queries are copyable
  Advanced Hunting pivots, not Log Analytics queries. The standard Sentinel
  connector does not ingest those TVM tables. Endpoint event hunts require
  separately ingested raw event tables if run in this workbook.

All assessment/resource Resource Graph sources explicitly filter the selected
subscription IDs. The unified CVE detail query runs at **tenant scope** because
`microsoft.security/cvedetails` is global; only that public CVE lookup is not
subscription-filtered. A deduplicated left join preserves findings without
visible metadata. Recommendations, inventory and pricing are current state, not
the alert/log time range.

The summary, unified findings and broader posture share the same environment and
workload classifier. Connector discovery is environment scoped but not narrowed
by the recommendation workload selector. The machine-gap panel applies to
All/Machines workloads; Azure subscription plan evidence appears only in
Organization overview and is not an entitlement verdict for external clouds.

**Additional source-scope exceptions:** the retained detailed ARM/DevOps grids
use selected Azure anchor subscriptions, not the organization Environment or
Recommendation workload filters. Azure resource log hunts additionally filter
workload `_SubscriptionId`. SecurityAlert records with no Azure resource mapping
and endpoint event hunts remain **workspace/device scoped**. These differences
are called out before the extra controls. Native portal/XDR links do not inherit
the workbook's scope; reapply it there.

## Azure WAF data already included

Set **Additional inventory and hunting** to **On** to access these existing
report views:

| Azure WAF items | Workbook location | Data source / prerequisite |
| --- | --- | --- |
| Front Door and Application Gateway WAF policy inventory, reported mode/state, managed rulesets and custom-rule counts | **Web apps and exposure > WAF policy candidates** | Azure Resource Graph; Reader access to the selected subscriptions/resources. Both Front Door object-shaped and Application Gateway array-shaped custom rules are handled. |
| Application Gateway, Front Door/CDN and public-IP configuration context, including reported firewall-policy references and inline WAF mode | **Web apps and exposure > Front-end / public-IP inventory candidates** | Azure Resource Graph. This is candidate configuration inventory, not an end-to-end route/association or PHP exposure map. |
| Application Gateway request-side rule/action summaries, policy IDs and ruleset versions | **Alerts and hunting > Optional collected source > AGWFirewallLogs** | Existing resource-specific Application Gateway WAF diagnostics collected into a readable Log Analytics workspace. The selector does not automatically substitute legacy AzureDiagnostics records. |
| Front Door request-side rule/action summaries and policy mode when reported | **Alerts and hunting > Optional collected source > AzureDiagnostics - Front Door WAF** | Existing FrontDoorWebApplicationFirewallLog diagnostics in the selected workspace. Category matching is case-insensitive to cover classic and Standard/Premium spellings. |

For logs, choose the workspace containing the selected table and the desired
time range. Azure resource log queries also filter the selected workload
subscription IDs. Missing tables/access failures remain explicit errors; no rows
does not establish coverage, prevention or no malicious activity.

WAF resource inventory and collected WAF logs do **not** require Defender CSPM
to be enabled. They do require the relevant Azure WAF resources, permissions
and, for telemetry, approved diagnostic collection and traffic through the
applicable WAF. Defender CSPM adds separate posture/risk context; it does not
enable WAF or diagnostic settings. This workbook changes none of those settings.

Validate actual policy association, effective mode, exclusions, direct-origin
bypass and application impact independently. A logged match/Block action alone
is not end-to-end enforcement or PHP2SHELL attribution. Front Door response-side
PHP2SHELL mitigation does not emit WAF logs/hit counts according to the linked
Microsoft guidance, so this report does not fabricate an effectiveness counter.

See [Front Door WAF monitoring](https://learn.microsoft.com/azure/web-application-firewall/afds/waf-front-door-monitor)
and the [Application Gateway WAF log schema](https://learn.microsoft.com/azure/azure-monitor/reference/tables/agwfirewalllogs)
for the supported collection/schema contracts.

## Time parameters, endpoint schemas and evidence limits

The Resource Graph PHP/web-shell alert card uses the time picker's native KQL
predicate:

```kusto
| where AlertTime {TimeRange:query}
```

This supports relative presets and custom ranges without manually wrapping
context-sensitive start/end values in `datetime(...)`. Additional wrappers can
produce invalid nested datetime literals and a generic Resource Graph error.
See [workbook time parameters](https://learn.microsoft.com/azure/azure-monitor/visualize/workbooks-time).

Previously imported or saved workbooks do not automatically receive this source
fix. Re-import the updated workbook through Advanced Editor, or edit the
**Reported Defender for Cloud PHP / web-shell alert candidates** query and
replace its time-filter line with the one above. Keep the remaining query and
subscription scope unchanged. This does not suppress permissions/query errors
or treat missing alerts as clearance.

Collected
[DeviceProcessEvents](https://learn.microsoft.com/azure/azure-monitor/reference/tables/deviceprocessevents),
[DeviceNetworkEvents](https://learn.microsoft.com/azure/azure-monitor/reference/tables/devicenetworkevents)
and [DeviceFileEvents](https://learn.microsoft.com/azure/azure-monitor/reference/tables/devicefileevents)
use Log Analytics `TimeGenerated`; the queries export `Timestamp = TimeGenerated`
for the existing grid labels. Native Defender XDR uses `Timestamp`: convert the
workspace query's time references rather than pasting it unchanged. The two TVM
inventory/vulnerability code blocks remain native Advanced Hunting queries.

Detail tables are bounded to 1,000 rows. A full table may be truncated; narrow the
scope or use native queries/export for complete results. Counts are not an
estate-wide inventory denominator. Counts use distinct recommendation IDs rather
than adding overlapping scanner rows. Grouped recommendations were deprecated on
2026-07-31 and are no longer queried as current PHP2SHELL coverage.
See [the recommendation schema transition](https://learn.microsoft.com/azure/defender-for-cloud/transition-grouped-individual-recommendations).

**No rows is not clearance.** Separate confirmed scanner CVE evidence,
configuration/inventory candidates and behavioral heuristics. Unknown/missing
plan or component configuration is **Not reported**, not Disabled. A plan set
to Standard does not prove successful scanning. Scan lag, retention, RBAC,
unsupported builds and missing collection can all produce gaps.

### Version and provenance evidence

Detected versions prefer the assessment field, then MDVM scanner evidence, then
the first reported **non-MDVM** alternate scanner. The alternate-key lookup
explicitly excludes `mdvm`, so an empty MDVM entry cannot be selected again and
mask valid alternate-scanner versions. Fixed versions prefer the **per-CVE**
field after expansion, then assessment, MDVM and alternate-scanner evidence.
Empty arrays/objects/null text do not mask valid fallback versions. The exported
source columns identify the selected evidence path. This preserves relevant
version evidence without pretending to merge every scanner payload or establish
vendor-backport/effective-runtime patch closure.

Native AWS/GCP source/provider evidence takes precedence over Arc representation.
Code-specific metadata identifies DevOps; Docker Hub/JFrog and unclassified
connectors remain Other. An unresolved connector is not labeled Azure solely
because it is stored in Azure. Raw reported source, connector platform/ID and
resource type remain visible for investigation.

Native ACR (`microsoft.containerregistry/registries`) is explicitly classified
as the Containers workload in the summary, unified findings and broader posture
views. Unknown registry types are not inferred to be containers from their name.
Repository connector identifiers use the provider-qualified security-connector
prefix, retaining valid resource groups or connectors named `devops`.

## Mitigation and privacy boundaries

Only a PHP update containing both fixes fully remediates the vulnerabilities.
The response tab lists the first fixed releases from the primary advisories and
requires effective web-SAPI/vendor-backport and all-worker/image verification.
It does not automatically infer patch status from major/minor stack settings,
string comparisons, healthy recommendations, or absent alerts.

WAF request-side controls need application-impact and effective-mode testing.
Front Door response-side mitigation does not emit WAF log entries/hit counts
according to the Microsoft article; the workbook does not fabricate an
effectiveness counter. Application Gateway response rewriting is a separate
platform-specific measure. Review the current guidance before changing controls.

The template does not execute exploits or mutate Azure. It deliberately avoids
projecting request bodies/cookies, full process command lines, exposed-secret
values, or raw DevOps scanner payloads. Treat resource/device identifiers and
any exported evidence according to the customer's handling policy.

## Validation

From the repository root:

```powershell
npm test -- --grep 'Validating Workbooks|Validating Gallery' --timeout 15000
git diff --check
```

The existing repository validators check workbook/gallery format, template
registration, unique/localizable identifiers and hardcoded-resource conventions.
No standalone PHP2SHELL test file is included. These format checks do not replace
KQL syntax/type/output-shape validation, portal rendering or authorized
source/coverage verification.

The standalone test remains removed. The alert-card time filter retains native
time-query interpolation. Review fixes cover alternate-scanner selection, ACR
workload classification and complete connector identifiers; WAF queries are
unchanged.
Earlier author validation results are historical, not a claim that removed
tests still run or that customer telemetry and detection effectiveness have
been validated. No customer records are embedded in the template.

Before gallery release, also validate in Azure:

1. Import through Advanced Editor and verify every tab, parameter, link, grid
   and export in the portal.
2. With authorized read-only access, run each Resource Graph query in the
   intended subscription scopes, including absent CVE metadata and missing
   pricing/component data. Confirm the intended tenant/account explicitly; do
   not silently use a default CLI/corporate session.
3. Exercise no-plan/no-data, supported/unsupported sources, explicit missing-table
   and access errors, real CVE findings if available, mixed mapped/unmapped
   alerts, optional endpoint workspace scope, empty-offering connectors,
   native-cloud Arc provenance and disconnected inventory.
4. Verify all four relative time presets and custom date ranges using actual
   workbook parameter expansions, not only manually substituted ISO strings.
   Verify the HTTP threshold boundaries and legitimate negative controls with
   approved synthetic fixtures; do not run exploitation. Exercise every
   environment/workload selection and scanner/per-CVE version-only cases. Use
   complete raw scanner bags, including empty MDVM plus a valid alternate entry,
   rather than only pre-resolved fallback values. Verify ACR registry posture
   under Containers and full connector IDs when names contain `devops`.
5. Confirm the source and guidance links remain current. A schema/parser test
   alone is not live rendering, product coverage, or detection-effectiveness
   validation.
