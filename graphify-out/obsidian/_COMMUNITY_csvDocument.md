---
type: community
members: 16
---

# csvDocument

**Members:** 16 nodes

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
- [[Injectable_17]] - code
- [[csvDocument()]] - code - dpdp-platform/backend/src/modules/inventory/csv-writer.ts
- [[sortedUnique()]] - code - dpdp-platform/backend/src/modules/inventory/ropa-export.service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/csvDocument
SORT file.name ASC
```

## Connections to other communities
- 9 edges to [[_COMMUNITY_AuditService]]
- 4 edges to [[_COMMUNITY_dot-record]]
- 4 edges to [[_COMMUNITY_csv-writer.ts]]
- 3 edges to [[_COMMUNITY_AuditReadService]]
- 2 edges to [[_COMMUNITY_EvidencePackController]]
- 1 edge to [[_COMMUNITY_@nestjscommon]]
- 1 edge to [[_COMMUNITY_RequirePermission]]
- 1 edge to [[_COMMUNITY_audit-chain.service.ts]]
- 1 edge to [[_COMMUNITY_formatEvidenceTimestamp]]
- 1 edge to [[_COMMUNITY_zip-writer.ts]]
- 1 edge to [[_COMMUNITY_PrismaService]]
- 1 edge to [[_COMMUNITY_audit-read.service.ts]]
- 1 edge to [[_COMMUNITY_access-report-render.ts]]
- 1 edge to [[_COMMUNITY_inventory.service.ts]]

## Top bridge nodes
- [[csvDocument()]] - degree 20, connects to 5 communities
- [[dot-buildPack()]] - degree 16, connects to 4 communities
- [[EvidencePackService]] - degree 15, connects to 4 communities
- [[dot-exportCsv()_1]] - degree 6, connects to 3 communities
- [[dot-exportCsv()]] - degree 5, connects to 3 communities