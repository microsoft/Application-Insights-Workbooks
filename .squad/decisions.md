# Decisions

### 2025-01-01: Service Group Filter Pattern
**By:** Arthur Clares
**What:** Use `relationshipresources | where type == 'microsoft.relationships/servicegroupmember'` join pattern for SG filtering. Reference: CostOptimization-merged.workbook.
**Why:** Consistent with existing merged workbook approach.

### 2025-01-01: Skip commitment-discounts
**By:** Arthur Clares
**What:** Do not modify commitment-discounts/commitment.workbook or CommitmentDiscounts/commitment.workbook — they don't support SG filter.
**Why:** User directive.

### 2026-03-04: SG filter join key varies by query
**By:** Dallas, Parker
**What:** Use each query's actual resource ID column name in `$left.XXX == $right._sgFilterId` rather than always assuming `id`. Examples: `apimId`, `sbId`, `resourceId`, `targetResource`, `profileId`.
**Why:** Not all queries expose `id` directly; some rename or transform it before the join point.

### 2026-03-04: Advisor catch-all queries — SG filter before summarize
**By:** Parker
**What:** For queries 22/22b–22e the SG filter is applied BEFORE `| summarize`, joining on the raw `resourceId` column per recommendation row.
**Why:** After summarize, only `impactedField` remains — not a joinable resource ID. Filtering must happen on individual recommendation rows.

### 2026-03-04: Query 10 (redundant-private-dns) — SG filter before summarize
**By:** Dallas (raised), Ash (validated fix)
**What:** Apply SG filter before `summarize` while individual zone `id` is still available, joining on `$left.id`. Post-summarize join on `zoneName` was broken (name ≠ resource ID).
**Why:** After summarize, zone IDs are aggregated into `make_list(id)` and no single resource ID column remains. Ash confirmed the pre-summarize approach works correctly.

### 2026-03-04: Case-sensitive join keys — use tolower on _sgFilterId
**By:** Ash (identified), Dallas (fixed)
**What:** When the left join key uses `tolower()` (queries 18, 19, 21), the SG filter must also use `tolower(tostring(properties.SourceId))` for `_sgFilterId`.
**Why:** KQL `==` in joins is case-sensitive. Mismatched casing causes SG filter to silently drop rows.

### 2026-03-04: v2 workbook grouping — 7 category groups
**By:** Ripley
**What:** Organize 26 v2 queries into 7 NotebookGroup (type 12) categories: Compute (5), Networking (5), Databases (2), Analytics (3), Security (1), Integration (4), Cross-cutting/Advisor (6).
**Why:** Matches the v2-query-tracker categories and aligns with the existing merged workbook tab structure.

### 2026-03-04: ServiceGroup parameter — no changes needed for v2
**By:** Ripley
**What:** The ServiceGroup parameter definition in the unsaved workbook is structurally identical to the merged workbook (same query, type, typeSettings, crossComponentResources). Only the auto-generated GUID differs.
**Why:** Confirmed by side-by-side comparison. No migration or modification required.
