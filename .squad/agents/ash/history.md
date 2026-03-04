# Ash — History

## Project Context
- Working on Application Insights Workbooks repo
- Validating Service Group filter additions to Cost Optimization sub-templates
- User: Arthur Clares
- Reference: CostOptimization-merged.workbook

## Learnings

### 2026-03-03 — SG Filter Validation (Sprint 1)

**Task:** Validate SG filter additions applied by `scripts/add_sg_filter_v2.py` to 6 Cost Optimization sub-templates.

**Validation script:** `scripts/validate_sg_filter.py` — 4 test suites, 77 checks, 0 failures.

**Results:**

1. **JSON Validity — ALL PASS.** All 6 modified workbooks parse cleanly as JSON.

2. **SG Filter Pattern Correctness — ALL PASS (56 queries across 6 files).**
   - Every SG block has the correct 3-line pattern: join, where, project-away.
   - Join keys verified against merged workbook for each query name — all match.
   - Breakdown: AHB=30, Compute=3, Databases=2, Networking=9, Storage=6, Top10Services=6.

3. **"No Changes" Files — ALL CORRECTLY SKIPPED.**
   - `AHB/new-ahb.workbook`: Already had all 30 SG filters pre-applied (it's a newer version of AHB that was authored with SG from the start). No action needed.
   - `Sustainability/Sustainability.workbook`: Uses AdvisorResources + carbon queries. No query names match the merged SG lookup. Correctly skipped.
   - `Reservations/Reservations.workbook`: All 3 queries use AdvisorResources (reservations scope). SG not applicable. Correctly skipped.
   - `Reservations Preview/ReservationsPreview.workbook`: Only 1 query (`SubNameMapping-Hidden`), not in merged lookup. Correctly skipped.
   - `ReservationsPreview/ReservationsPreview.workbook`: Same as above. Correctly skipped.
   - `SavingsPlan/SavingsPlan.workbook`: 2 queries using AdvisorResources. No matching names. Correctly skipped.

4. **Cross-Reference with Merged Workbook — ALL PASS.**
   - Merged workbook has 55 unique query names with SG filters.
   - Sub-templates collectively have 55 unique SG query names — exact match.
   - Raw count is 86 because `new-ahb.workbook` (30 pre-existing) overlaps with `AHB.workbook` (30 newly added). This is expected.

**Key insight:** The `add_sg_filter_v2.py` matching is name-based. `new-ahb.workbook` was skipped not because its names differ, but because its queries already contained the `servicegroupmember` marker — the script's `SG_MARKER not in query.lower()` check correctly prevented double-application.

**No issues found. No decisions/inbox entry needed.**
