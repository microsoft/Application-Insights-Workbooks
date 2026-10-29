# PHP2SHELL exposure and investigation

A read-only Azure Monitor workbook in **Defender for Cloud > Workbooks >
Community**, beside **Log4j Vulnerability**. The subscription picker, tabbed
layout, finding grids, resource links, and exports follow the Log4j template.
The existing Log4j workbook is unchanged.

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

| Tab | Contents |
| --- | --- |
| Overview and coverage | Exact CVE matches in individual recommendations and legacy grouped subassessments; reported plan/component settings; assessment-source context. |
| Machines | Reported machine CVEs; ARM VM/VMSS/Arc inventory candidates; copyable Defender XDR PHP inventory and CVE queries. |
| Containers | Reported image CVEs; ACR/AKS/Arc Kubernetes/Container Apps/ACI candidates; configured Container Apps/ACI image references; running-image investigation guidance. |
| Web apps and exposure | App Service apps and slots, reported runtime/public-access configuration, WAF policies, front ends/public IPs, PHP/CVE text-match attack paths, and cross-cutting hardening context. |
| DevOps | Connected Azure DevOps/GitHub/GitLab repository inventory, exact CVE findings, PHP/Composer keyword candidates, code/IaC/dependency/secret recommendation metadata, and SBOM/code-to-cloud pivots. |
| Alerts and hunting | Defender for Cloud alert candidates and opt-in queries for ten collected telemetry sources, with source-specific collection and scope notes. |
| Response and verification | Microsoft guidance, first fixed PHP releases, mitigation boundaries, patch verification, and customer handoff checklist. |

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

All Resource Graph queries inherit the subscription picker. Recommendations,
inventory and pricing are current state, not the alert/log time range.
Azure resource log hunts additionally filter workload `_SubscriptionId`.
SecurityAlert records with no Azure resource mapping and endpoint event hunts
remain explicitly **workspace/device scoped**. Native portal/XDR links do not
inherit the workbook's scope; reapply it there.

Detail tables are bounded to 1,000 rows. A full table may be truncated; narrow the
scope or use native queries/export for complete results. Counts are not an
estate-wide inventory denominator. Individual and grouped vulnerability findings
can overlap during the schema transition and must not be added together.
See [the recommendation schema transition](https://learn.microsoft.com/azure/defender-for-cloud/transition-grouped-individual-recommendations).

**No rows is not clearance.** Separate confirmed scanner CVE evidence,
configuration/inventory candidates and behavioral heuristics. Unknown/missing
plan or component configuration is **Not reported**, not Disabled. A plan set
to Standard does not prove successful scanning. Scan lag, retention, RBAC,
unsupported builds and missing collection can all produce gaps.

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
npm test -- --grep 'Validating Workbooks|Validating Gallery|PHP2SHELL' --timeout 10000
git diff --check
```

The focused regression tests check gallery placement, unique/localizable steps,
scope and time controls, CVE/schema handling, optional-source gates, conservative
coverage states, privacy boundaries, and the HTTP hunt thresholds.

Author validation on 2026-10-29 also included Kusto.Language syntax/type/output
analysis of all 34 workbook, parameter and copyable Advanced Hunting queries,
and read-only Azure Resource Graph execution of the finding, coverage, App
Service, configured-container, WAF and DevOps pipelines. Only validation aggregates
were retrieved; no customer records are embedded in the template.

Query-only synthetic fixtures on the actual Resource Graph engine confirmed:

- Legacy array, singular-ID, nested-CVE, string-array and case-variant findings
  matched; unrelated-prefix and Healthy controls did not.
- Individual array/JSON-string CVE details, native identifiers and serverless
  resource types were retained; unrelated, Healthy and empty controls did not
  produce findings.
- Missing/empty component data remained unknown; both boolean and string
  Enabled/Disabled states and Free-tier rows were preserved.
- HTTP POST/5xx, count, byte-size and fixed-bin boundary controls returned only
  the two expected positive cases.

These fixtures were evaluated inside read-only queries, not ingested into Azure.
They do not demonstrate exploitation, real vulnerable assets, or product
detection effectiveness. Optional Log Analytics tables and portal rendering
still require validation in the customer's authorized environment.

Before gallery release, also validate in Azure:

1. Import through Advanced Editor and verify every tab, parameter, link, grid
   and export in the portal.
2. With authorized read-only access, run each Resource Graph query in the
   intended subscription scopes, including both finding schemas and absent
   pricing/component data.
3. Exercise no-plan/no-data, supported/unsupported sources, explicit missing-table
   and access errors, real CVE findings if available, mixed mapped/unmapped
   alerts, and optional endpoint workspace scope.
4. Verify the HTTP threshold boundaries and legitimate negative controls with
   approved synthetic fixtures; do not run exploitation.
5. Confirm the source and guidance links remain current. A schema/parser test
   alone is not live rendering, product coverage, or detection-effectiveness
   validation.
