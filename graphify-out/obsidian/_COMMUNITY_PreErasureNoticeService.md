---
type: community
members: 12
---

# PreErasureNoticeService

**Members:** 12 nodes

## Members
- [[dot-cancelOnContact()]] - code - dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts
- [[dot-constructor()_84]] - code - dpdp-platform/backend/src/queues/pre-erasure-notice.processor.ts
- [[dot-process()_7]] - code - dpdp-platform/backend/src/queues/pre-erasure-notice.processor.ts
- [[dot-runForAllOrganizations()_2]] - code - dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts
- [[dot-runForCurrentOrganization()_2]] - code - dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts
- [[dot-sendDueNotices()]] - code - dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts
- [[Injectable_48]] - code
- [[PreErasureNoticeProcessor]] - code - dpdp-platform/backend/src/queues/pre-erasure-notice.processor.ts
- [[PreErasureNoticeService]] - code - dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts
- [[Processor_7]] - code
- [[buildCancellationReason()]] - code - dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts
- [[buildPreErasureNoticeBody()]] - code - dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/PreErasureNoticeService
SORT file.name ASC
```

## Connections to other communities
- 6 edges to [[_COMMUNITY_PrismaService]]
- 5 edges to [[_COMMUNITY_queues.module.ts]]
- 2 edges to [[_COMMUNITY_notifications.module.ts]]
- 2 edges to [[_COMMUNITY_dot-record]]
- 1 edge to [[_COMMUNITY_@nestjscommon]]

## Top bridge nodes
- [[PreErasureNoticeService]] - degree 11, connects to 3 communities
- [[dot-sendDueNotices()]] - degree 7, connects to 3 communities
- [[dot-cancelOnContact()]] - degree 5, connects to 2 communities
- [[PreErasureNoticeProcessor]] - degree 5, connects to 1 community
- [[dot-process()_7]] - degree 3, connects to 1 community