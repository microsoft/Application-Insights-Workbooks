# Log4j workbook: organization overview and environment investigation

Reviewed against current Microsoft Learn and Apache documentation on **2026-10-29**.
The [updated workbook](./Log4j.workbook) is an importable community template,
not a change to an already deployed Azure workbook or the published gallery.

## Recommendation

**Use an organization overview and environment tabs, not scanner or licensing
tabs.** The default view combines whatever findings and coverage evidence are
visible across the selected subscriptions in the intended signed-in tenant.
Azure, AWS, GCP, Hybrid/Arc, DevOps, and external/unclassified environments reuse
the same findings surface. Workload is a filter, not another navigation hierarchy.

Foundational CSPM, paid Defender CSPM, and workload protection are evidence and
coverage layers. They do not gate which reported findings the workbook displays.
Defender CSPM includes supported agentless assessment and risk/attack-path context;
its integrated machine/image scanner is MDVM, not a second scanner to count
separately. Runtime and dependency evidence are complementary, not interchangeable.

The most important newer additions are:

- **Agentless code scanning and SBOM (Preview):** connected Azure DevOps/GitHub
  repositories can be assessed for supported dependencies, including Maven/Gradle.
  Cloud Security Explorer can locate repositories using a package and version.
- **Serverless protection:** eligible Web Apps, Functions, and Lambda packages
  have vulnerability-assessment capabilities, with portal and eligibility limits.
- **Serverless Containers:** supported ACA, ACI, and ECS/Fargate workloads gain
  posture/image assessment context, not runtime EDR.
- **2026 schema migration:** individual recommendations replaced the grouped
  model; detailed CVE metadata is now consumed through a tenant-scoped ARG table.

## Review of the original workbook

| Issue | Impact | Update |
| --- | --- | --- |
| TVM/Qualys presented as the current integrated choices | Obsolete product/provider model | Use MDVM terminology; explain that supported Qualys/Rapid7 BYOL is distinct from retired integrated Qualys. |
| Queries depend on old grouped recommendation IDs and subassessments | Current findings can be absent even when resources are vulnerable | Query individual `microsoft.security/assessments` in `SoftwareUpdate` and `ServiceUpgrade`, expanding `CvesDetails.CveId`. |
| Detailed CVE properties assumed to be inline | Missing or incomplete CVE metadata after the August 2026 change | Left-join `microsoft.security/cvedetails` at tenant scope; filter the assessment side to selected subscriptions. |
| TVM machine widget used `value::all` instead of the selected subscription scope | Findings could be inconsistent with the visible subscription filter | Every ARG query now explicitly filters selected subscription IDs. |
| The Qualys machine query did not actually filter to Qualys | MDVM findings could be mislabeled as Qualys | Remove the misleading provider split; do not infer scan provenance from old source strings. |
| Default CVEs omitted CVE-2021-44832 | Incomplete 2021 Log4j 2 family | Include 44228, 45046, 45105, and 44832. |
| Static 2021-only view | Newer Log4j issues cannot be investigated | Add an all-reported-Log4j scope using whole software-name terms plus the explicit 2021 family; avoid substring matches to unrelated packages such as log4js. |
| Registry-level CVE aggregation | Individual packages/images and remediation context were obscured | Preserve recommendation ID, package/version, image URI, repository, and published workload details. |
| “No unhealthy machines found” implied reassurance without coverage checks | Disabled scans, unsupported packaging, stale data, and permission gaps looked safe | Add plan and software-inventory evidence, scan limitations, and explicit unknown/no-data messages. |
| No code, PaaS, exposure, or incident-response context | Important investigation surfaces were missing | Combine reported evidence with environment-led investigation, connector/plan context, and optional runtime guidance. |
| Capability/provider tabs obscure the organizational picture | Users must reconcile several overlapping screens | Default to Organization overview, then use environment tabs and a workload filter over a single unified findings table. |

Grouped recommendations were deprecated on **2026-07-31**. The **2026-08-21**
release notes describe the CVE detail change. These are functional query changes,
not merely new product labels. See the [transition guidance][transition],
[machine export examples][machine-findings], and [release notes][release-notes].

## What can identify Log4j in Azure?

| Capability | What it can tell you | Prerequisites and important limits |
| --- | --- | --- |
| **MDVM through Defender for Servers / Defender for Endpoint** | Vulnerable software; supported Log4j JAR/uber-JAR and device/file evidence | Servers P1/P2 for the integrated agent-based path; supported sensor/OS and onboarding. File coverage differs by platform. [Machine scanning][machine-scan], [Log4Shell guidance][log4shell]. |
| **Defender CSPM or Servers P2 agentless machine scanning** | Reported vulnerable software on supported Azure/AWS/GCP machine disks | Enable the component, permissions, and supported disk/machine configurations. Scans are periodic, normally every 24 hours; this is not EDR and not automatic on-premises disk scanning. [Agentless coverage][agentless]. |
| **Defender for Containers / supported Defender CSPM image assessment** | Vulnerabilities in supported registry images and images mapped to running Kubernetes workloads | Registry access and appropriate discovery/sensor settings. Language-package registry scanning is **Linux-only**, so do not promise Java coverage for Windows images. Runtime image scanning is not a scan of every writable runtime layer. [Container VA][container-va]. |
| **Defender CSPM contextual risk** | Which reported findings have high risk, internet exposure, sensitive-target relationships, or reported attack-path references | Paid Defender CSPM and adequate underlying telemetry. No visible risk context does not mean low risk. [Security graph][graph]. |
| **Defender for Cloud DevOps agentless code scanning (Preview)** | Supported open-source dependency vulnerabilities and a generated SBOM in connected Azure DevOps/GitHub repositories | Enable the relevant scanners and repository scope. Default-branch, repository-size, permissions, region, and cadence limitations apply. Java dependency analysis is not the same as Java SAST. [Code scanning][code-scan]. |
| **Defender CSPM SBOM exploration** | Which scanned repositories contain a package/version, even before a particular CVE finding is published | Initial scan must complete. Search the real normalized package names in Cloud Security Explorer. Presence is not proof of vulnerability. [SBOM queries][sbom]. |
| **GitHub Dependabot/dependency review and relevant Advanced Security capabilities** | Vulnerable dependencies and risky dependency changes in supported ecosystems | Enable/configure the relevant feature; entitlement and private-repository support differ. Do not assume SAST or secret scanning supplies SCA. [DevOps support][devops-support]. |
| **GitHub Advanced Security dependency scanning for Azure DevOps** | Dependency vulnerabilities in supported Azure DevOps builds/repositories | Appropriate entitlement, configured dependency scanning, and connector integration where required. Basic DevOps connectivity is not equivalent to a completed dependency scan. [DevOps support][devops-support]. |
| **Defender CSPM Serverless protection** | Eligible Web App/Function/Lambda package/dependency assessment plus posture and risk context | Separate component and billing. Current docs place VA in the **Defender portal**. Stopped apps, apps with public network access disabled, and listed app kinds are excluded. Do not weaken network controls to obtain a scan. [Serverless protection][serverless]. |
| **Defender CSPM Serverless Containers** | Supported ACA/ACI/ECS-Fargate inventory, image-related vulnerabilities, and attack-path context | Separate component; Registry access for full coverage. **Posture-only**, not runtime threat detection or active response. [Serverless containers][serverless-containers]. |
| **Defender for Endpoint/XDR and workload protection alerts** | Suspicious activity and evidence relevant to attempted exploitation or compromise | Required workload plans, sensors, alert coverage, and retention. A vulnerable package does not prove compromise; no alert does not disprove it. [Log4Shell investigation][log4shell]. |
| **Front Door / Application Gateway WAF** | Covered exploit-request patterns; blocking when effective prevention settings apply | Correct managed rules, effective enabled rules/paranoia level, policy mode, exclusions, TLS/inspection visibility, and logs. Not a software inventory. Front Door's newer DRS lists Log4Shell rule `944240` at paranoia level 2; verify the effective policy. [Front Door rules][waf]. |
| **Azure Firewall Premium IDPS** | Signature-based suspicious network activity on inspected/routed traffic | IDPS policy/signatures and, where applicable, supported TLS inspection. Not an exhaustive application dependency scan. [Firewall Premium][firewall]. |
| **Microsoft Sentinel / Log Analytics** | Correlated alerts and ingested endpoint, workload, WAF, firewall, and DNS evidence | Connectors, diagnostic settings/continuous export, retention, and detection rules. It does not automatically scan unobserved JARs. [SecurityAlert table][security-alert]. |
| **Qualys / Rapid7 BYOL or external SCA/container scanners** | Additional findings within that tool's actual scan scope | Separate licensing, integration, and supported export/schema. The retired built-in Qualys integration must not be confused with supported BYOL. [BYOL and integrated scanning][machine-scan]. |

Azure Policy, Azure Update Manager, Defender for SQL VA, and Defender for Storage
malware scanning should **not** be presented as generic Log4j application-JAR
inventories. They address different control, patching, database, or malware
problems. OS patch compliance does not establish that an application bundled with
an old Log4j library has been rebuilt.

## Log4Shell is not every Log4j vulnerability

The default workbook view tracks four **2021 Log4j 2 CVEs**. CVE-2021-45105 is a
denial-of-service issue, and CVE-2021-44832 has configuration-related prerequisites;
they should not all be described as identical unauthenticated Log4Shell RCE.

Choose **All reported Log4j package CVEs** to include additional CVEs when the
service identifies a `log4j` or `log4j2` term in the software name. This also allows
reported Log4j 1.x/bridge/API findings to surface, but does not claim exhaustive
coverage of differently named, shaded, vendor-repackaged, unreported, or
unsupported components. Use SBOM and supported binary/file analysis to investigate
those gaps.

Apache's current advisories include later issues such as **CVE-2025-68161** and
**CVE-2026-34477** (TLS hostname verification), **CVE-2026-34481**, and
**CVE-2026-49844** (invalid JSON/log integrity). These are not new names for the
2021 Log4Shell exploit. Check the affected artifact, version, configuration, and
remediation in the [Apache security advisories][apache].

Do not treat “upgrade to 2.17.1” or an old environment-variable mitigation as a
universal current fix. Use the supported, currently patched vendor/application
release for the relevant Java/runtime branch; rebuild and redeploy images and
applications, then verify the effective running artifact and updated findings.
Suspected compromise requires investigation in addition to patching.

## Organization overview and environment navigation

| Tab | Purpose |
| --- | --- |
| **Organization overview** (default) | Combine visible environments, unified Log4j findings, wider posture evidence, discovered connectors, Azure subscription plan evidence, and Azure/Arc inventory gaps. |
| **Azure** | Native Azure machine, container/Kubernetes, application, and serverless findings, narrowed with the workload filter if needed. |
| **AWS** | AWS findings and connector context, including Arc machines with reported AWS provenance. |
| **GCP** | GCP findings and connector context, including Arc machines with reported GCP provenance. |
| **Hybrid / Arc** | Other Arc/hybrid findings and connection/inventory evidence; not a claim that every resource is on-premises. |
| **DevOps** | GitHub, Azure DevOps, GitLab, and other recognizable code findings; connector discovery remains visible even without a Log4j finding. |
| **Other / external** | External registry integrations such as Docker Hub/JFrog plus unclassified findings, rather than silently dropping them or assigning Azure provenance. |

The shared dashboard has:

- A Log4j recommendation/CVE breakdown by environment and workload.
- **One unified findings table**, retaining package/version, image/repository,
  source, Arc provider, connector ID, reported CSPM risk/attack-path references,
  and recommendation IDs. No duplicate agentless/agent-based totals.
- **Broader posture evidence**, deliberately labeled as not Log4j verdicts. This
  can expose foundational posture data even where Log4j VA is unavailable.
- Connector inventory independent of finding volume. Discovery does not claim
  connector health, complete account/repository scope, or completed scans.
- Organization-level Azure subscription plan evidence that starts from visible
  subscriptions and left-joins reported pricing. Missing records stay **Unknown**;
  only explicitly reported Free/Standard is labeled Foundational/paid.
- Azure VM/Arc inventory evidence retaining disconnected Arc machines. The
  check excludes AKS node resource groups and does not enumerate all VMSS,
  native AWS/GCP machines, never-onboarded assets, or containers.
- Optional detailed capabilities and runtime investigation under **Guidance /
  runtime investigation**. No log query runs until that is enabled and a
  workspace is selected.

Detected versions prefer the assessment's top-level value, then the preferred
scanner entry (`mdvm`, or the first available scanner). Arrays are displayed as
comma-separated versions; scalar version strings retain their original
precision. Each expanded CVE's fixed version takes precedence over the
assessment-level and preferred-scanner fallback. The full `ScannersDetails`
object remains available in the findings grid/export, preserving other scanner
evidence without expanding scanner entries into duplicate finding rows.

### Classification and coverage rules

Assessment source/provider metadata determines environment, not the Azure
subscription that hosts a connector. A left-joined context lookup reads either
available [Arc cloud metadata][arc-schema] for an Arc machine or the reported
connector's platform metadata for other resources. This avoids separate repeated
ARG lookups while recognizing AWS/GCP Arc machines and connected code/external
platforms.
Recognized native AWS/GCP provenance takes precedence over Arc representation.
Code-specific source/provider names identify DevOps; missing/new provenance
remains **Other**, visible in the overview and its own tab. External or unresolved
connectors are not labeled native Azure merely because a generic Azure source
or Azure-hosted connector ID is present. Raw connector platform/ID and source
remain visible for investigation.

The same classifier and environment/workload filters are used by the Log4j
summary, unified findings, and broader posture evidence. Unknown workload types
remain visible. Container/image findings can be attached to an image rather than
the consuming app; retain the raw resource type and published workload context.

Connector discovery uses the documented [security connector schema][connector-schema]
and preserves all connector rows, including those without offerings or findings.
GitHub, Azure DevOps, and GitLab are DevOps platforms; reported external
registries remain external/Other. Their feature support and scanner entitlements
are not assumed identical.

Plan/license data is context, never a condition for showing a finding. Azure
anchor subscription pricing is not an entitlement verdict for AWS/GCP/DevOps.
Inspect native component settings, connector offerings, resource overrides,
scan results, and portal-specific availability separately.

All ARG queries explicitly filter `{Subscription:subid}`. Queries joining
`microsoft.security/cvedetails` run at **tenant scope**, because Microsoft
documents that subscription-scoped queries do not return that global table.
The global CVE lookup is not subscription-filtered; the assessment side is.
A left join preserves findings without metadata and labels missing severity.

The runtime alert query is deliberately **workspace/time scoped**, not narrowed
by the Subscription, Environment, Workload, or Finding scope controls. Alert ingestion does not always
retain a reliable resource subscription. This difference is called out beside
the picker and in the table title. Keyword filtering is a triage aid, not a
complete exploitation detector. Missing tables and permission failures remain
visible query errors, not synthetic empty results.

These are current-state reports, not a historical vulnerability timeline.
Counts by environment/workload are recommendation/CVE counts, not scanner totals or an
exact census of vulnerable machines. ARG expansion and result limits apply;
use paginated ARG/API exports for an exhaustive inventory. Plan records do not
enumerate every resource override or connected-cloud setting. Consult native
coverage/scan results before declaring remediation complete.

## Native DevOps/SBOM investigation

1. Enable the appropriate repository scanners through the Azure DevOps/GitHub
   connector and verify completion of the initial scan.
2. In **Defender for Cloud > Cloud Security Explorer**, select the code repository
   type and add **Application > Has installed software**.
3. Filter **Name** and **Version** using package names actually present in the
   generated SBOM. Investigate `log4j`, `log4j-core`, `log4j-api`, and applicable
   bridge/legacy packages; Maven coordinates can include
   `org.apache.logging.log4j:log4j-core`.
4. Inspect the package's CVEs and dependency ownership. Package presence alone is
   not proof that a vulnerable version/configuration is in use.
5. For images, follow [code-to-runtime mapping][code-to-runtime] to the source
   repository/pipeline. Supported mappings include connectors, Docker/OCI labels,
   and GitHub attestations. Do not equate provenance with vulnerability assessment.
6. Update, rebuild, redeploy, and verify both source and running image/package.

Microsoft currently documents agentless code scanning as **Preview**. Queryable
SBOM and advanced contextual DevOps features have Defender CSPM requirements;
basic repository inventory/recommendations and third-party scanning entitlements
are separate. Check the current [platform/feature matrix][devops-support] rather
than assuming all capabilities are included in every plan.

## Defender advanced-hunting examples

Run these in **Microsoft Defender advanced hunting**, not ARG or an arbitrary
Log Analytics workspace. Access depends on product entitlement and table coverage.

Vulnerable-software evidence:

```kusto
DeviceTvmSoftwareVulnerabilities
| where CveId in~ (
    "CVE-2021-44228", "CVE-2021-45046",
    "CVE-2021-45105", "CVE-2021-44832"
)
| project DeviceId, DeviceName, SoftwareVendor, SoftwareName, SoftwareVersion, CveId
```

File-path evidence, where the documented Beta table is available:

```kusto
DeviceTvmSoftwareEvidenceBeta
| mv-expand DiskPaths
| where DiskPaths contains "log4j"
| project DeviceId, SoftwareName, SoftwareVendor, SoftwareVersion, DiskPaths
```

The second query locates evidence; matching a file path alone does not confirm
a vulnerable version, reachability, or compromise. Review actual device timeline,
process, network, alert, and incident evidence in the native investigation
experience. Do not enable active device-discovery probes without authorization.

## Import and validate

1. In Azure Monitor or Defender for Cloud **Workbooks**, create a new workbook or
   a copy of the existing workbook.
2. Open **Edit > Advanced Editor** and use the contents of
   [Log4j.workbook](./Log4j.workbook).
3. Apply and save as a new workbook. Select the intended subscriptions.
4. Verify plan/component configuration and a known finding in the native
   recommendation experience. Compare the recommendation ID and CVE with the
   unified findings table before relying on counts.
5. Test one subscription, multiple subscriptions, and All. Test both finding
   scopes, a known resource without inventory evidence, and restricted CVE-detail
   access. Exercise every environment tab and workload filter; reconcile native
   AWS/GCP Arc provenance, unknown types, and connector rows without findings
   against Organization overview.
6. If needed, enable **Guidance / runtime investigation**, select a workspace
   with actual `SecurityAlert` ingestion, and validate the time range against
   native logs.
7. For live browser review, use an isolated Playwright context and explicitly
   confirm the intended tenant/account before reading subscriptions or importing
   a draft. Complete sign-in/MFA directly in the browser, never in tool arguments
   or source files. Do not silently use a default CLI/corporate session. Compare
   rendered query results and errors with native Defender/ARG views; local schema
   or browser-startup checks alone do not prove live workbook correctness.

No Azure configuration, paid plan, connector, scanner, active probe, workbook
deployment, or telemetry ingestion is enabled by importing the JSON itself.
Executing its queries can still have normal data-source access/cost implications.
Review current plan/component prices before enabling additional protection.

The repository's format intentionally differs from Sentinel solution workbook
packaging: these gallery `.workbook` files must **not** include `fromTemplateId`.

Repository validation:

```powershell
npm test -- --grep 'Validating Workbooks|Validating Gallery' --timeout 15000
```

The existing repository validators check workbook and gallery template
conventions. No standalone Log4j test file is included. These format checks do
not substitute for KQL validation, live ARG/Log Analytics execution, or Azure
portal rendering in the intended environment.

## Sources

These references were retrieved for this review; capability availability can
change. Verify Preview status, region, plan entitlement, exclusions, and portal
availability for the specific environment.

- [Recommendation/schema transition][transition]
- [Machine findings and tenant-scoped CVE export][machine-findings]
- [2026 Defender for Cloud release notes][release-notes]
- [Integrated machine scanning and BYOL][machine-scan]
- [Agentless machine scanning coverage][agentless]
- [MDVM Log4Shell software and file guidance][log4shell]
- [Container vulnerability assessment][container-va]
- [Cloud security graph and attack paths][graph]
- [Reported risk fields and ARG examples][risk-schema]
- [Agentless code scanning (Preview)][code-scan]
- [Queryable SBOM][sbom]
- [DevOps support, feature prerequisites, and entitlements][devops-support]
- [Container code-to-runtime mapping][code-to-runtime]
- [Serverless protection and exclusions][serverless]
- [Serverless container posture and limitations][serverless-containers]
- [Front Door WAF managed rules][waf]
- [Azure Firewall Premium IDPS][firewall]
- [SecurityAlert schema][security-alert]
- [Security connector platforms, scope, and offerings][connector-schema]
- [Arc cloud metadata and machine properties][arc-schema]
- [Apache security advisories][apache]

[transition]: https://learn.microsoft.com/azure/defender-for-cloud/transition-grouped-individual-recommendations
[machine-findings]: https://learn.microsoft.com/azure/defender-for-cloud/remediate-vulnerability-findings-vm
[release-notes]: https://learn.microsoft.com/azure/defender-for-cloud/release-notes
[machine-scan]: https://learn.microsoft.com/azure/defender-for-cloud/auto-deploy-vulnerability-assessment
[agentless]: https://learn.microsoft.com/azure/defender-for-cloud/enable-agentless-scanning-vms
[log4shell]: https://learn.microsoft.com/defender-vulnerability-management/tvm-manage-log4shell-guidance
[container-va]: https://learn.microsoft.com/azure/defender-for-cloud/agentless-vulnerability-assessment-azure
[graph]: https://learn.microsoft.com/azure/defender-for-cloud/concept-attack-path
[risk-schema]: https://learn.microsoft.com/azure/defender-for-cloud/add-data-power-bi#query-defender-for-cloud-data-into-power-bi
[code-scan]: https://learn.microsoft.com/azure/defender-for-cloud/agentless-code-scanning
[sbom]: https://learn.microsoft.com/azure/defender-for-cloud/query-software-bill-of-materials
[devops-support]: https://learn.microsoft.com/azure/defender-for-cloud/devops-support
[code-to-runtime]: https://learn.microsoft.com/azure/defender-for-cloud/container-image-mapping
[serverless]: https://learn.microsoft.com/azure/defender-for-cloud/serverless-protection
[serverless-containers]: https://learn.microsoft.com/azure/defender-for-cloud/posture-for-serverless-containers
[waf]: https://learn.microsoft.com/azure/web-application-firewall/afds/waf-front-door-drs
[firewall]: https://learn.microsoft.com/azure/firewall/premium-features#idps
[security-alert]: https://learn.microsoft.com/azure/azure-monitor/reference/tables/securityalert
[connector-schema]: https://learn.microsoft.com/azure/templates/microsoft.security/securityconnectors
[arc-schema]: https://learn.microsoft.com/rest/api/hybridcompute/machines/get
[apache]: https://logging.apache.org/security.html
