# Dallas — History

## Project Context
- Working on Application Insights Workbooks repo
- Adding Service Group filtering to Cost Optimization sub-templates
- User: Arthur Clares
- Stack: Azure Monitor Workbooks (JSON), KQL, Python

## Learnings

### 2026-03-03 — SG Filter Script (add_sg_filter.py)

**Architecture decisions:**
- Name-based matching between merged and sub-template workbook items works perfectly — every ARG query item name in the sub-templates has an exact match in the merged workbook. No fuzzy/query-text matching needed.
- The merged workbook (`CostOptimization-merged.workbook`) has 56 ARG queries with SG filters and 41 without. The 41 without are overview/advisor/parameter queries that intentionally skip SG filtering.
- Only 2 of 12 sub-templates needed updates: `AHB/AHB.workbook` (26 queries) and `AHB/new-ahb.workbook` (30 queries). The other 10 were already correct.

**Patterns:**
- SG filter block is always the last 3 lines of a query, separated by `\r\n`. It's a `| join kind=leftouter` on `relationshipresources` with `servicegroupmember`, followed by a where clause and project-away.
- 11 distinct join keys are used (`id`, `WindowsId`, `SQLDBID`, `SQLID`, `ManagedInstance`, `LinuxId`, `PublicIpId`, `DiskId`, `FWID`, `ERId`, `planId`).
- Workbook JSON files use CRLF line endings; `json.dumps` produces LF, so must convert on write.
- Type 3 items: query steps. Type 9: parameter items (ARG param queries exist but none needed SG in the merged). Type 12: groups (recurse into `content.items[]`).

**Key file paths:**
- Script: `scripts/add_sg_filter.py`
- Merged baseline: `Workbooks/Azure Advisor/Cost Optimization/CostOptimization-merged.workbook`
- AHB sub-templates: `Workbooks/Azure Advisor/Cost Optimization/AHB/AHB.workbook`, `AHB/new-ahb.workbook`

### 2026-03-04 — SG Filter on v2 ARG Query KQL Files (02–13)

**What was done:**
- Added the 3-line ServiceGroup filter pattern (`join kind=leftouter` on `relationshipresources`, `where`, `project-away`) to all 12 KQL files (02 through 13) in `Workbooks/Azure Advisor/Cost Optimization/v2/ARG queries/`.

**Join key decisions per file:**
- `id` (standard): 02, 04, 05, 08, 11, 12, 13
- `envId` (tolower'd id): 03 — used `tolower()` on `_sgFilterId` to match
- `imageId` (tolower'd id): 06 — same tolower approach
- `profileId` (tolower'd id): 07 — same tolower approach
- `targetResource` (tolower'd target resource): 09 — aggregated query, joined on the target PLS resource ID
- `zoneName` (NOT a resource ID): 10 — **edge case**, see decisions inbox

**Edge cases:**
- Queries 09 (duplicate PEs) and 10 (redundant private DNS) are aggregated queries without a single resource `id` column. For 09, `targetResource` is a valid Azure resource ID so the SG filter will work correctly by filtering on the target resource's ServiceGroup membership. For 10, `zoneName` is a DNS zone name (e.g., `privatelink.database.windows.net`), NOT a resource ID — the SG filter is effectively a no-op when a ServiceGroup is selected (all rows filtered out). When no ServiceGroup is selected, all rows pass through correctly. Flagged for Ripley in decisions inbox.
- For queries where the ID column uses `tolower()` (03, 06, 07, 09), the `_sgFilterId` projection also uses `tolower()` to ensure case-insensitive join matching.
- Placement rule: SG filter goes after `| project` but before `| order by` when present.
