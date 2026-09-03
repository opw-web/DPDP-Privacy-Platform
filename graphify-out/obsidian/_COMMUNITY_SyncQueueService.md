---
type: community
members: 42
---

# SyncQueueService

**Members:** 42 nodes

## Members
- [[dot-constructor()_138]] - code - dpdp-platform/backend/src/modules/sync/sync.service.ts
- [[dot-constructor()_139]] - code - dpdp-platform/backend/src/queues/consent-backfill.queue.ts
- [[dot-constructor()_140]] - code - dpdp-platform/backend/src/queues/deadline-scan.queue.ts
- [[dot-constructor()_141]] - code - dpdp-platform/backend/src/queues/mvp2-schedules.ts
- [[dot-constructor()_142]] - code - dpdp-platform/backend/src/queues/retention-scan.queue.ts
- [[dot-constructor()_143]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-constructor()_144]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.queue.ts
- [[dot-constructor()_145]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-listScheduledDataSourceIds()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-onModuleInit()_1]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[dot-reconcile()]] - code - dpdp-platform/backend/src/queues/mvp2-schedules.ts
- [[dot-reconcile()_1]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-reconcileAtBoot()]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[dot-register()]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[dot-removeSchedule()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-schedulerCount()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[dot-upsertSchedule()]] - code - dpdp-platform/backend/src/queues/sync.queue.ts
- [[BootRegistration]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[BootRegistrationRegistry]] - code - dpdp-platform/backend/src/queues/boot-registration.registry.ts
- [[DeadlineScanQueueService]] - code - dpdp-platform/backend/src/queues/deadline-scan.queue.ts
- [[InjectQueue_3]] - code
- [[InjectQueue_4]] - code
- [[InjectQueue_5]] - code
- [[InjectQueue_6]] - code
- [[InjectQueue_7]] - code
- [[InjectQueue_8]] - code
- [[Injectable_78]] - code
- [[Injectable_79]] - code
- [[Injectable_80]] - code
- [[Injectable_81]] - code
- [[Injectable_82]] - code
- [[Injectable_83]] - code
- [[Mvp2ScheduleReconciliationService]] - code - dpdp-platform/backend/src/queues/mvp2-schedules.ts
- [[RECONCILE_BOOT_TIMEOUT_MS]] - code - dpdp-platform/backend/src/queues/boot-timeout.util.ts
- [[ScheduleReconciliationService]] - code - dpdp-platform/backend/src/queues/schedule-reconciliation.service.ts
- [[SdfCycleScanQueueService]] - code - dpdp-platform/backend/src/queues/sdf-cycle-scan.queue.ts
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
- 16 edges to [[_COMMUNITY_queues.module.ts]]
- 8 edges to [[_COMMUNITY_mvp2-schedules.ts]]
- 5 edges to [[_COMMUNITY_retention.module.ts]]
- 3 edges to [[_COMMUNITY_consent-backfill.queue.ts]]
- 3 edges to [[_COMMUNITY_DataSourcesService]]
- 2 edges to [[_COMMUNITY_sync.service.ts]]
- 1 edge to [[_COMMUNITY_PrismaService]]
- 1 edge to [[_COMMUNITY_audit-chain-verify.processor.ts]]
- 1 edge to [[_COMMUNITY_data-sources.service.ts]]
- 1 edge to [[_COMMUNITY_connector.factory.ts]]
- 1 edge to [[_COMMUNITY_prisma.service.ts]]

## Top bridge nodes
- [[SyncQueueService]] - degree 16, connects to 4 communities
- [[BootRegistrationRegistry]] - degree 15, connects to 4 communities
- [[schedule-reconciliation.service.ts]] - degree 14, connects to 4 communities
- [[boot-registration.registry.ts]] - degree 11, connects to 4 communities
- [[Mvp2ScheduleReconciliationService]] - degree 8, connects to 3 communities