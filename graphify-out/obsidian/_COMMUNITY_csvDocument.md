---
type: community
members: 17
---

# csvDocument

**Members:** 17 nodes

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
- [[dot-exportCsv()_1]] - code - dpdp-platform/backend/src/modules/inventory/ropa-export.service.ts
- [[EvidencePackService]] - code - dpdp-platform/backend/src/modules/evidence/evidence-pack.service.ts
- [[Injectable_6]] - code
- [[csvDocument()]] - code - dpdp-platform/backend/src/modules/inventory/csv-writer.ts
- [[renderAccessReportCsv()]] - code - dpdp-platform/backend/src/modules/evidence/access-report-render.ts
- [[sortedUnique()]] - code - dpdp-platform/backend/src/modules/inventory/ropa-export.service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/csvDocument
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_AuditService]]
- 4 edges to [[_COMMUNITY_dot-record]]
- 4 edges to [[_COMMUNITY_csv-writer.ts]]
- 2 edges to [[_COMMUNITY_EvidencePackController]]
- 2 edges to [[_COMMUNITY_audit-read.controller.ts]]
- 2 edges to [[_COMMUNITY_access-report-render.ts]]
- 1 edge to [[_COMMUNITY_MaskingService]]
- 1 edge to [[_COMMUNITY_app.module.ts]]
- 1 edge to [[_COMMUNITY_@nestjsswagger]]
- 1 edge to [[_COMMUNITY_supertest]]
- 1 edge to [[_COMMUNITY_AuditChainService]]
- 1 edge to [[_COMMUNITY_formatEvidenceTimestamp]]
- 1 edge to [[_COMMUNITY_PrismaService]]
- 1 edge to [[_COMMUNITY_zip-writer.ts]]
- 1 edge to [[_COMMUNITY_audit-read.service.ts]]
- 1 edge to [[_COMMUNITY_InventoryService]]

## Top bridge nodes
- [[csvDocument()]] - degree 20, connects to 4 communities
- [[dot-buildPack()]] - degree 16, connects to 4 communities
- [[EvidencePackService]] - degree 15, connects to 4 communities
- [[dot-accessLogCsv()]] - degree 6, connects to 3 communities
- [[dot-exportCsv()_1]] - degree 6, connects to 3 communities