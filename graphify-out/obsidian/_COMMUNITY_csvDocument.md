---
type: community
members: 15
---

# csvDocument

**Members:** 15 nodes

## Members
- [[dot-accessLogCsv()]] - code - dpdp-platform/backend/src/modules/audit/audit-read.service.ts
- [[dot-buildBreachFileCsv()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-buildConsentLedgerCsv()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-buildDataInventoryCsv()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-buildGrievanceReportCsv()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-buildPack()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-buildRequestRegisterCsv()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-buildRetentionScheduleCsv()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-buildSdfRecordsCsv()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-buildSharingRegisterCsv()]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[dot-exportCsv()]] - code - dpdp-platform/backend/src/modules/evidence/audit-export.service.ts
- [[EvidencePackService]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[Injectable_11]] - code
- [[csvDocument()]] - code - dpdp-platform/backend/src/modules/inventory/csv-writer.ts
- [[renderAccessReportCsv()]] - code - dpdp-platform/backend/src/modules/evidence/access-report-render.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/csvDocument
SORT file.name ASC
```

## Connections to other communities
- 5 edges to [[_COMMUNITY_csv-writer.ts]]
- 4 edges to [[_COMMUNITY_evidence-pack.service.ts]]
- 3 edges to [[_COMMUNITY_AuditReadService]]
- 3 edges to [[_COMMUNITY_dot-record]]
- 3 edges to [[_COMMUNITY_ropa-export.service.ts]]
- 2 edges to [[_COMMUNITY_EvidencePackController]]
- 2 edges to [[_COMMUNITY_audit-read.service.ts]]
- 2 edges to [[_COMMUNITY_access-report-render.ts]]
- 1 edge to [[_COMMUNITY_app.module.ts]]
- 1 edge to [[_COMMUNITY_RequirePermission]]
- 1 edge to [[_COMMUNITY_AuditReadController]]
- 1 edge to [[_COMMUNITY_PrismaService]]
- 1 edge to [[_COMMUNITY_AuditChainService]]
- 1 edge to [[_COMMUNITY_erasure-task.service.ts]]

## Top bridge nodes
- [[csvDocument()]] - degree 20, connects to 5 communities
- [[dot-buildPack()]] - degree 16, connects to 5 communities
- [[EvidencePackService]] - degree 15, connects to 5 communities
- [[dot-accessLogCsv()]] - degree 6, connects to 4 communities
- [[dot-exportCsv()]] - degree 5, connects to 3 communities