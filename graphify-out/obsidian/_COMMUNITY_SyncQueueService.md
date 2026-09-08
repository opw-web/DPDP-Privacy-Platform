---
type: community
members: 12
---

# SyncQueueService

**Members:** 12 nodes

## Members
- [[dot-listScheduledDataSourceIds()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-reconcile()]] - code - dpdp-platform/backend/src/queues/mvp2-schedules.ts
- [[dot-reconcile()_1]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-reconcileAtBoot()]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-removeSchedule()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-schedulerCount()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-upsertSchedule()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[Injectable_87]] - code
- [[Injectable_88]] - code
- [[ScheduleReconciliationService]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[SyncQueueService]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[syncSchedulerId()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SyncQueueService
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_schedule-reconciliation.service.ts]]
- 3 edges to [[_COMMUNITY_BootRegistrationRegistry]]
- 2 edges to [[_COMMUNITY_app.module.ts]]
- 2 edges to [[_COMMUNITY_sync.e2e-spec.ts]]
- 2 edges to [[_COMMUNITY_sync.queue.ts]]
- 2 edges to [[_COMMUNITY_SyncLockService]]
- 2 edges to [[_COMMUNITY_DataSourcesService]]
- 1 edge to [[_COMMUNITY_audit.service.ts]]
- 1 edge to [[_COMMUNITY_sync.service.ts]]
- 1 edge to [[_COMMUNITY_Connector]]
- 1 edge to [[_COMMUNITY_SyncService]]

## Top bridge nodes
- [[SyncQueueService]] - degree 16, connects to 10 communities
- [[ScheduleReconciliationService]] - degree 7, connects to 4 communities
- [[dot-reconcileAtBoot()]] - degree 4, connects to 1 community
- [[dot-removeSchedule()]] - degree 4, connects to 1 community
- [[dot-upsertSchedule()]] - degree 4, connects to 1 community