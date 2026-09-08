---
type: community
members: 16
---

# SdfCycleScanService

**Members:** 16 nodes

## Members
- [[dot-computeDeadline()]] - code - dpdp-platform/backend/src/modules/compliance/compliance.service.ts
- [[dot-constructor()_84]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.processor.ts
- [[dot-create()_19]] - code - dpdp-platform/backend/src/modules/requests/requests.service.ts
- [[dot-createInactivityTasks()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-findSdfManagerEmployeeIds()]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[dot-process()_6]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.processor.ts
- [[dot-resolveCycleDeadline()]] - code - dpdp-platform/backend/src/modules/sdf/sdf-assessment.service.ts
- [[dot-resolveRule()]] - code - dpdp-platform/backend/src/modules/compliance/compliance.service.ts
- [[dot-runForAllOrganizations()_2]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[dot-runForCurrentOrganization()_2]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[dot-sendWarningsIfDue()]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts
- [[dot-snapshotOnto()]] - code - dpdp-platform/backend/src/modules/compliance/compliance.service.ts
- [[Injectable_50]] - code
- [[Processor_6]] - code
- [[SdfCycleScanProcessor]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.processor.ts
- [[SdfCycleScanService]] - code - dpdp-platform/backend/src/modules/sdf/sdf-cycle-scan.service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SdfCycleScanService
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_AuditService]]
- 4 edges to [[_COMMUNITY_dot-record]]
- 3 edges to [[_COMMUNITY_RequestsService]]
- 3 edges to [[_COMMUNITY_queues.module.ts]]
- 3 edges to [[_COMMUNITY_RetentionScanService]]
- 3 edges to [[_COMMUNITY_ErasureTaskService]]
- 2 edges to [[_COMMUNITY_@nestjscommon]]
- 2 edges to [[_COMMUNITY_@prismaclient]]
- 1 edge to [[_COMMUNITY_SdfAssessmentService]]
- 1 edge to [[_COMMUNITY_PrismaService]]
- 1 edge to [[_COMMUNITY_NotificationsService]]
- 1 edge to [[_COMMUNITY_SdfController]]
- 1 edge to [[_COMMUNITY_CreateSdfAssessmentDto]]
- 1 edge to [[_COMMUNITY_erasure-task.service.ts]]
- 1 edge to [[_COMMUNITY_MeRightsService]]

## Top bridge nodes
- [[SdfCycleScanService]] - degree 11, connects to 5 communities
- [[dot-resolveRule()]] - degree 9, connects to 5 communities
- [[dot-create()_19]] - degree 9, connects to 4 communities
- [[dot-computeDeadline()]] - degree 8, connects to 3 communities
- [[dot-createInactivityTasks()]] - degree 6, connects to 3 communities