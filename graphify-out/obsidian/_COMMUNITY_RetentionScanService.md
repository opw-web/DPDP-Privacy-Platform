---
type: community
members: 17
---

# RetentionScanService

**Members:** 17 nodes

## Members
- [[dot-applyLegalHolds()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-computeDeadline()]] - code - dpdp-platform/backend/src/modules/compliance/compliance.service.ts
- [[dot-constructor()_131]] - code - dpdp-platform/backend/src/queues/retention-scan.processor.ts
- [[dot-create()_30]] - code - dpdp-platform/backend/src/modules/requests/requests.service.ts
- [[dot-createInactivityTasks()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-createPurposeServedTasks()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-promoteFromFloor()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-promoteNoticeSentToReady()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-releaseLegalHolds()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-resolveCycleDeadline()]] - code - dpdp-platform/backend/src/modules/sdf/sdf-assessment.service.ts
- [[dot-resolveRule()]] - code - dpdp-platform/backend/src/modules/compliance/compliance.service.ts
- [[dot-runForAllOrganizations()_3]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-runForCurrentOrganization()_3]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[dot-snapshotOnto()]] - code - dpdp-platform/backend/src/modules/compliance/compliance.service.ts
- [[dot-transitionTask()]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts
- [[Injectable_78]] - code
- [[RetentionScanService]] - code - dpdp-platform/backend/src/modules/retention/retention-scan.service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/RetentionScanService
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_prisma.service.ts]]
- 5 edges to [[_COMMUNITY_ErasureTaskService]]
- 4 edges to [[_COMMUNITY_queues.module.ts]]
- 3 edges to [[_COMMUNITY_compliance.service.ts]]
- 3 edges to [[_COMMUNITY_RequestsService]]
- 3 edges to [[_COMMUNITY_ComplianceService]]
- 2 edges to [[_COMMUNITY_dot-record]]
- 2 edges to [[_COMMUNITY_sdf-cycle-scan.queue.ts]]
- 2 edges to [[_COMMUNITY_BreachService]]
- 1 edge to [[_COMMUNITY_guardians.service.ts]]
- 1 edge to [[_COMMUNITY_SdfAssessmentService]]
- 1 edge to [[_COMMUNITY_SdfController]]
- 1 edge to [[_COMMUNITY_CreateSdfAssessmentDto]]
- 1 edge to [[_COMMUNITY_MeRightsService]]

## Top bridge nodes
- [[dot-resolveRule()]] - degree 9, connects to 5 communities
- [[dot-computeDeadline()]] - degree 8, connects to 5 communities
- [[dot-create()_30]] - degree 9, connects to 4 communities
- [[RetentionScanService]] - degree 16, connects to 3 communities
- [[dot-transitionTask()]] - degree 8, connects to 3 communities