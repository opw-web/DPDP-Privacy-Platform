---
type: community
members: 14
---

# RetentionScanService

**Members:** 14 nodes

## Members
- [[dot-applyLegalHolds()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-constructor()_130]] - code - dpdp-platform/backend/src/queues/retention-scan.processor.ts
- [[dot-createPurposeServedTasks()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-process()_10]] - code - dpdp-platform/backend/src/queues/retention-scan.processor.ts
- [[dot-promoteFromFloor()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-promoteNoticeSentToReady()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-releaseLegalHolds()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-runForAllOrganizations()_3]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-runForCurrentOrganization()_3]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-transitionTask()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[Injectable_76]] - code
- [[Processor_10]] - code
- [[RetentionScanProcessor]] - code - dpdp-platform/backend/src/queues/retention-scan.processor.ts
- [[RetentionScanService]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/RetentionScanService
SORT file.name ASC
```

## Connections to other communities
- 4 edges to [[_COMMUNITY_erasure-task.service.ts]]
- 3 edges to [[_COMMUNITY_queues.module.ts]]
- 3 edges to [[_COMMUNITY_SdfCycleScanService]]
- 2 edges to [[_COMMUNITY_@nestjscommon]]
- 2 edges to [[_COMMUNITY_AuditService]]
- 1 edge to [[_COMMUNITY_@prismaclient]]
- 1 edge to [[_COMMUNITY_PrismaService]]
- 1 edge to [[_COMMUNITY_ErasureTaskService]]
- 1 edge to [[_COMMUNITY_dot-record]]

## Top bridge nodes
- [[RetentionScanService]] - degree 16, connects to 6 communities
- [[dot-transitionTask()]] - degree 8, connects to 3 communities
- [[RetentionScanProcessor]] - degree 5, connects to 2 communities
- [[dot-promoteFromFloor()]] - degree 5, connects to 2 communities
- [[dot-createPurposeServedTasks()]] - degree 4, connects to 2 communities