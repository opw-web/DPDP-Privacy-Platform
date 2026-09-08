---
type: community
members: 12
---

# SyncQueueService

**Members:** 12 nodes

## Members
- [[dot-constructor()_72]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-listScheduledDataSourceIds()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-reconcile()]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-remove()]] - code - dpdp-platform/backend/src/modules/data-sources/data-sources.service.ts
- [[dot-removeSchedule()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-removeScheduleBestEffort()]] - code - dpdp-platform/backend/src/modules/data-sources/data-sources.service.ts
- [[dot-schedulerCount()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-upsertSchedule()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[InjectQueue]] - code
- [[Injectable_43]] - code
- [[SyncQueueService]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[syncSchedulerId()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SyncQueueService
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_queues.module.ts]]
- 5 edges to [[_COMMUNITY_data-sources.service.ts]]
- 2 edges to [[_COMMUNITY_SyncService]]
- 1 edge to [[_COMMUNITY_employee-auth.controller.ts]]
- 1 edge to [[_COMMUNITY_dot-update]]
- 1 edge to [[_COMMUNITY_DataSourcesController]]
- 1 edge to [[_COMMUNITY_dot-record]]

## Top bridge nodes
- [[SyncQueueService]] - degree 16, connects to 3 communities
- [[dot-remove()]] - degree 4, connects to 3 communities
- [[dot-reconcile()]] - degree 5, connects to 1 community
- [[dot-upsertSchedule()]] - degree 4, connects to 1 community
- [[syncSchedulerId()]] - degree 4, connects to 1 community