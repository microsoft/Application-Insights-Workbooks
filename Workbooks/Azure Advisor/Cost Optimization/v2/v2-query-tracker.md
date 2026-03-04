# Cost Optimization v2 — Query Tracker

## Overview
Additional cost optimization ARG queries identified by the Squad gap analysis. Each query targets resource waste patterns not covered in the current CostOptimization workbook.

## Query Status

| # | Query Name | Category | Filename | ARG Compatible | Implemented | Tested by Squad | Manually Tested | Ported to Workbook | Merged to Testworkbook | No data message | Notes |
|---|-----------|----------|----------|----------------|-------------|-----------------|-----------------|-------------------|------------------------|-----------------|-------|
| ~~1~~ | ~~Oversized VMs (right-sizing)~~ | ~~Compute~~ | ~~`01-oversized-vms.kql`~~ | — | — | — | — | — | — | — | ⛔ **REMOVED** — Duplicate of existing Compute tab (which has suppression-awareness + CPU threshold support) |
| 2 | Dev/Test subs running production SKUs | Compute | `02-devtest-production-skus.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ No Dev/Test subscriptions found running production-grade VM SKUs. | ✅ Approved. Joins ResourceContainers with VMs |
| 3 | Unused Container Apps environments | Compute | `03-unused-container-apps-envs.kql` | Yes | Yes | ✅ Pass (1) | No | No | Y | ✅ All Container Apps environments have at least one container app deployed. | ✅ Approved. Modified: added `appCount` column via summarize/coalesce pattern |
| 4 | Idle Container Instances | Compute | `04-idle-container-instances.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ No idle or stopped container instances found. | ⏸️ **On hold** — To be reviewed with PG, not sure if it is relevant |
| 5 | Spot VM opportunity analysis | Compute | `05-spot-vm-opportunities.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ No Spot VM conversion candidates found in dev/test environments. | ✅ Approved. Modified: added tag-based filtering alongside RG name matching |
| 6 | Orphaned custom VM images | Compute | `06-orphaned-vm-images.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ No orphaned custom VM images found — all images are referenced by VMs or VMSS. | ✅ Approved. leftouter + isnull against VMs + VMSS |
| 7 | Idle Front Door / CDN profiles | Networking | `07-idle-frontdoor-cdn.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ All Front Door / CDN profiles have active endpoints configured. | ✅ Approved. leftouter + isnull: profiles with no AFD endpoints |
| 8 | Pending/Rejected Private Endpoints | Networking | `08-pending-rejected-pes.kql` | Yes | Yes | ✅ Pass (1) | No | No | Y | ✅ All Private Endpoints are in Approved state. | ✅ Approved. Confirmed different from existing networking tab PE query (broader scope: all non-Approved states) |
| 9 | Duplicate PEs to same target | Networking | `09-duplicate-pes.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ No duplicate Private Endpoints found targeting the same resource from the same VNet. | ✅ Approved. Same target + VNet grouping |
| 10 | Redundant Private DNS zones | Networking | `10-redundant-private-dns.kql` | Yes | Yes | ✅ Pass (1) | No | No | Y | ✅ No redundant Private DNS zones found within the same subscription. | ⚠️ **Clear documentation required** — duplicate zone names may be legitimate (false positives risk) |
| 11 | Idle Traffic Manager profiles | Networking | `11-idle-traffic-manager.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ All Traffic Manager profiles have enabled endpoints. | ✅ Approved. No endpoints or all disabled |
| 12 | Stopped MySQL/PostgreSQL Flex | Databases | `12-stopped-mysql-postgresql-flex.kql` | Yes | Yes | ✅ Pass (2) | No | No | Y | ✅ No stopped MySQL or PostgreSQL Flexible Servers found. | 📝 **Document clearly:** storage costs only — compute is stopped, but storage charges continue |
| 13 | MariaDB instances (deprecated) | Databases | `13-mariadb-deprecated.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ No deprecated MariaDB instances found. | ✅ Approved. Should migrate to MySQL Flex |
| 14 | Synapse idle dedicated SQL pools | Analytics | `14-synapse-idle-sql-pools.kql` | Partial | Yes | ✅ Pass (0) | No | No | Y | ✅ No online Synapse Dedicated SQL Pools found — all pools are paused or no pools exist. | ✅ Approved. ARG: Online pools. Needs metrics for usage detection |
| 15 | Idle Data Factory pipelines | Analytics | `15-idle-data-factory.kql` | Partial | Yes | ✅ Pass (4) | No | No | Y | ✅ No Data Factory instances found that may be idle. Cross-reference with pipeline activity for confirmation. | ✅ Approved. ARG: lists factories. Needs Activity Log for run detection |
| 16 | Azure AI Services idle deployments | Analytics | `16-idle-ai-services.kql` | Partial | Yes | ✅ Pass (0) | No | No | Y | ✅ No Azure AI Services accounts found that may be idle. Cross-reference with usage metrics for confirmation. | ✅ Approved. Renamed `kind` to `aiKind` (KQL keyword conflict). Needs metrics. |
| 17 | DDoS Protection Plans (<10 PIPs) | Security | `17-ddos-protection-plans.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ No under-utilized DDoS Protection Plans found — all plans protect 10 or more public IPs. | 📝 **Clear documentation required** — $2,944/mo with <10 PIPs = high cost-per-IP ratio |
| 18 | Idle API Management | Integration | `18-idle-api-management.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ All API Management instances have at least one custom API configured. | ✅ Approved. Paid tiers with no APIs |
| 19 | Idle Service Bus namespaces | Integration | `19-idle-service-bus.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ All Premium Service Bus namespaces have active queues or topics. | ✅ Approved. Premium tier, no queues/topics |
| 20 | Idle Logic Apps (Standard) | Integration | `20-idle-logic-apps.kql` | Partial | Yes | ✅ Pass (0) | No | No | Y | ✅ No idle Standard Logic Apps found. Cross-reference with workflow run history for confirmation. | ✅ Approved. ARG: lists Standard apps. Needs metrics for run detection |
| 21 | Idle Event Grid topics/domains | Integration | `21-idle-event-grid.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ All Event Grid topics and domains have active event subscriptions. | ✅ Approved. leftouter + isnull: no event subscriptions |
| 22 | Advisor Cost catch-all | Cross-cutting | `22-advisor-cost-catchall.kql` | Yes | Yes | ✅ Pass (2) | No | No | Y | ✅ No Azure Advisor cost recommendations found for the selected scope. | ✅ Approved. Fixed stray `resources` line. Aggregates all cost recs by impacted field |
| 22b | Advisor Reliability catch-all | Cross-cutting | `22b-advisor-reliability-catchall.kql` | Yes | Yes | ✅ Pass (20) | No | No | Y | ✅ No Azure Advisor reliability recommendations found for the selected scope. | **NEW** — HighAvailability category Advisor recommendations |
| 22c | Advisor Security catch-all | Cross-cutting | `22c-advisor-security-catchall.kql` | Yes | Yes | ✅ Pass (16) | No | No | Y | ✅ No Azure Advisor security recommendations found for the selected scope. | **NEW** — Security category Advisor recommendations |
| 22d | Advisor Performance catch-all | Cross-cutting | `22d-advisor-performance-catchall.kql` | Yes | Yes | ✅ Pass (2) | No | No | Y | ✅ No Azure Advisor performance recommendations found for the selected scope. | **NEW** — Performance category Advisor recommendations |
| 22e | Advisor Operational Excellence catch-all | Cross-cutting | `22e-advisor-operational-excellence-catchall.kql` | Yes | Yes | ✅ Pass (3) | No | No | Y | ✅ No Azure Advisor operational excellence recommendations found for the selected scope. | **NEW** — OperationalExcellence category Advisor recommendations |
| 23 | App Service Plans no autoscale | Cross-cutting | `23-app-service-plans-no-autoscale.kql` | Yes | Yes | ✅ Pass (0) | No | No | Y | ✅ All multi-worker App Service Plans have autoscale configured. | ⚠️ **Clear documentation required** — multi-worker without autoscale may be intentional |

## Legend
- **ARG Compatible**: `Yes` = fully implementable in ARG. `Partial` = ARG surfaces candidates, but full idle/usage detection requires metrics data.
- **Implemented**: KQL file created in `ARG queries/` folder.
- **Tested by Squad**: Validated via `az graph query` in PowerShell.
- **Manually Tested**: Verified by a human against live Azure subscription.
- **Ported to Workbook**: Query integrated into the CostOptimization workbook JSON.
