---
type: community
members: 9
---

# ConsentBackfillService

**Members:** 9 nodes

## Members
- [[dot-constructor()_18]] - code - dpdp-platform/backend/src/modules/consents/consent-backfill.service.ts
- [[dot-constructor()_19]] - code - dpdp-platform/backend/src/queues/consent-backfill.processor.ts
- [[dot-process()]] - code - dpdp-platform/backend/src/queues/consent-backfill.processor.ts
- [[dot-runForAllOrganizations()]] - code - dpdp-platform/backend/src/modules/consents/consent-backfill.service.ts
- [[dot-runForCurrentOrganization()]] - code - dpdp-platform/backend/src/modules/consents/consent-backfill.service.ts
- [[ConsentBackfillProcessor]] - code - dpdp-platform/backend/src/queues/consent-backfill.processor.ts
- [[ConsentBackfillService]] - code - dpdp-platform/backend/src/modules/consents/consent-backfill.service.ts
- [[Injectable_11]] - code
- [[Processor]] - code

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/ConsentBackfillService
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_queues.module.ts]]
- 2 edges to [[_COMMUNITY_@nestjscommon]]
- 2 edges to [[_COMMUNITY_PrismaService]]

## Top bridge nodes
- [[ConsentBackfillService]] - degree 9, connects to 3 communities
- [[ConsentBackfillProcessor]] - degree 5, connects to 2 communities
- [[dot-process()]] - degree 3, connects to 1 community