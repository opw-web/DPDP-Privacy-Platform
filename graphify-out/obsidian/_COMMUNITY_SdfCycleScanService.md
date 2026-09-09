---
type: community
members: 12
---

# SdfCycleScanService

**Members:** 12 nodes

## Members
- [[dot-constructor()_53]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.processor.ts
- [[dot-findSdfManagerEmployeeIds()]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[dot-process()_2]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.processor.ts
- [[dot-runForAllOrganizations()]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[dot-runForCurrentOrganization()]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[dot-sendWarningsIfDue()]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[Injectable_31]] - code
- [[Processor_2]] - code
- [[SdfCycleScanJobData]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.queue.ts
- [[SdfCycleScanProcessor]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.processor.ts
- [[SdfCycleScanService]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[sdf-cycle-scan.processor.ts]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.processor.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SdfCycleScanService
SORT file.name ASC
```

## Connections to other communities
- 5 edges to [[_COMMUNITY_queues.module.ts]]
- 4 edges to [[_COMMUNITY_PrismaService]]
- 3 edges to [[_COMMUNITY_app.module.ts]]
- 2 edges to [[_COMMUNITY_RetentionScanService]]
- 1 edge to [[_COMMUNITY_AuditService]]
- 1 edge to [[_COMMUNITY_notifications.module.ts]]
- 1 edge to [[_COMMUNITY_dot-record]]
- 1 edge to [[_COMMUNITY_@nestjscommon]]

## Top bridge nodes
- [[sdf-cycle-scan.processor.ts]] - degree 10, connects to 4 communities
- [[SdfCycleScanService]] - degree 11, connects to 3 communities
- [[dot-runForCurrentOrganization()]] - degree 7, connects to 3 communities
- [[SdfCycleScanProcessor]] - degree 5, connects to 1 community
- [[dot-sendWarningsIfDue()]] - degree 4, connects to 1 community