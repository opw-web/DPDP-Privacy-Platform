---
type: community
members: 36
---

# SyncQueueService

**Members:** 36 nodes

## Members
- [[dot-constructor()_38]] - code - dpdp-platform/backend/src/modules/data-sources/data-sources.service.ts
- [[dot-constructor()_39]] - code - dpdp-platform/backend/src/queues/consent-backfill.queue.ts
- [[dot-constructor()_40]] - code - dpdp-platform/backend/src/queues/deadline-scan.queue.ts
- [[dot-constructor()_41]] - code - dpdp-platform/backend/src/queues/mvp2-schedules.ts
- [[dot-constructor()_42]] - code - dpdp-platform/backend/src/queues/retention-scan.queue.ts
- [[dot-constructor()_43]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-constructor()_44]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.queue.ts
- [[dot-listScheduledDataSourceIds()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-onModuleInit()]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[dot-reconcile()]] - code - dpdp-platform/backend/src/queues/mvp2-schedules.ts
- [[dot-reconcile()_1]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-reconcileAtBoot()]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-register()]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[dot-removeSchedule()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-schedulerCount()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-upsertSchedule()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[BootRegistration]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[BootRegistrationRegistry]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[InjectQueue_3]] - code
- [[InjectQueue_4]] - code
- [[InjectQueue_5]] - code
- [[InjectQueue_6]] - code
- [[InjectQueue_7]] - code
- [[Injectable_23]] - code
- [[Injectable_24]] - code
- [[Injectable_25]] - code
- [[Injectable_26]] - code
- [[Mvp2ScheduleReconciliationService]] - code - dpdp-platform/backend/src/queues/mvp2-schedules.ts
- [[RECONCILE_BOOT_TIMEOUT_MS]] - code - dpdp-platform/backend/src/queues/boot-timeout.util.ts
- [[ScheduleReconciliationService]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[SyncQueueService]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[boot-registration.registry.ts]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[boot-timeout.util.ts]] - code - dpdp-platform/backend/src/queues/boot-timeout.util.ts
- [[schedule-reconciliation.service.ts]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[syncSchedulerId()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[withBootTimeout()]] - code - dpdp-platform/backend/src/queues/boot-timeout.util.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/SyncQueueService
SORT file.name ASC
```

## Connections to other communities
- 23 edges to [[_COMMUNITY_queues.module.ts]]
- 3 edges to [[_COMMUNITY_sync.e2e-spec.ts]]
- 3 edges to [[_COMMUNITY_PrismaService]]
- 2 edges to [[_COMMUNITY_DataSourcesService]]
- 2 edges to [[_COMMUNITY_sync-lock.service.ts]]
- 2 edges to [[_COMMUNITY_@nestjscommon]]
- 1 edge to [[_COMMUNITY_access-log-retention.processor.ts]]
- 1 edge to [[_COMMUNITY_data-sources.service.ts]]
- 1 edge to [[_COMMUNITY_SyncService]]
- 1 edge to [[_COMMUNITY_rest-api.connector.ts]]
- 1 edge to [[_COMMUNITY_AuditService]]
- 1 edge to [[_COMMUNITY_@nestjsconfig]]
- 1 edge to [[_COMMUNITY_dot-remove]]

## Top bridge nodes
- [[SyncQueueService]] - degree 16, connects to 6 communities
- [[schedule-reconciliation.service.ts]] - degree 15, connects to 4 communities
- [[dot-constructor()_38]] - degree 5, connects to 4 communities
- [[boot-registration.registry.ts]] - degree 12, connects to 2 communities
- [[Mvp2ScheduleReconciliationService]] - degree 8, connects to 2 communities