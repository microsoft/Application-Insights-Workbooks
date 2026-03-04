# Ripley — History

## Project Context
- Application Insights Workbooks repo — Cost Optimization SG filter project
- User: Arthur Clares

## Learnings

### 2026-03-04 — Workbook Structure Analysis (Phase 2/3 Planning)
- The unsaved workbook's ServiceGroup parameter is structurally identical to the merged workbook's version (only the auto-generated `id` GUID differs). No parameter changes needed for v2.
- The merged workbook is 14,331 lines with a deeply nested type-12 group hierarchy: root tabs → category groups → sub-category groups → individual query items. The v2 workbook must replicate this nesting pattern.
- Every ARG query must use `crossComponentResources: ["{Subscription}"]` and must have the SG filter join appended at the end (3-line pattern: leftouter join on relationshipresources → where SG empty or matched → project-away).
- The existing tab categories are: Compute, Storage, Networking, Databases, Sustainability, Top 10. The v2 queries require two new tabs: **Analytics** and **Integration**.
- Cross-cutting Advisor catch-all queries (22x series) should map to existing root-level groups (securityRecommendations, reliabilityRecommendations) or a new Advisor Overview group.
- The unsaved workbook is a minimal scaffold with correct parameters but only one sample query (no SG filter, no tab structure). Phase 3 builds on top of it.
- Decision document written to `.squad/decisions/inbox/ripley-workbook-structure.md` for Dallas and Parker.
