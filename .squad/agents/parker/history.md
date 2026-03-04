# Parker — History

## Project Context
- **Project:** Application Insights Workbooks — Cost Optimization Service Group Filter
- **User:** Arthur Clares
- **Stack:** Azure Monitor Workbooks (JSON/KQL), Python scripts, PowerShell
- **Description:** Adding Service Group filtering to all Cost Optimization v2 sub-template KQL queries and assembling them into a test workbook.

## Learnings
### 2026-03-04 — SG filter added to KQL files 14–23
- Added ServiceGroup filter pattern to all 14 KQL files (14 through 23 inclusive, including 22b–22e).
- **Standard resource queries (14, 15, 16, 20):** Joined on `id` — straightforward append after final `| project`.
- **Renamed-ID queries (17, 18, 19, 21):** These queries project the resource ID under a different column name (`planId`, `apimId`, `sbId`, `resourceId`). Used the renamed column in `$left.XXX == $right._sgFilterId`.
- **Advisor queries (22, 22b, 22c, 22d, 22e):** These aggregate with `| summarize` so there's no row-level `id` in the final output. Inserted the SG filter BEFORE the `| summarize`, joining on `resourceId` (extracted from `properties.resourceMetadata.resourceId`), which is the actual Azure resource the recommendation targets.
- **Order-by preservation (14, 16, 17, 23):** SG filter was placed before `| order by` to maintain sort order as the last operation.
- Edge case: DDoS query (17) and Event Grid query (21) both use `tolower(id)` aliases — the SG join compares against these lowered IDs, which may cause case-sensitivity mismatches with the relationship resource SourceId. Worth monitoring during testing.