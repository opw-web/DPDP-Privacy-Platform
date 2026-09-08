---
type: community
members: 12
---

# MockHttpServer

**Members:** 12 nodes

## Members
- [[dot-close()]] - code - dpdp-platform/backend/src/modules/connectors/test-support/mock-http-server.ts
- [[dot-constructor()_41]] - code - dpdp-platform/backend/src/modules/connectors/test-support/mock-http-server.ts
- [[dot-listen()]] - code - dpdp-platform/backend/src/modules/connectors/test-support/mock-http-server.ts
- [[dot-setHandler()]] - code - dpdp-platform/backend/src/modules/connectors/test-support/mock-http-server.ts
- [[MockHttpServer]] - code - dpdp-platform/backend/src/modules/connectors/test-support/mock-http-server.ts
- [[jsonHandler()]] - code - dpdp-platform/backend/src/modules/connectors/test-support/mock-http-server.ts
- [[pagedHandler()]] - code - dpdp-platform/backend/test/step6-conflict-acceptance.e2e-spec.ts
- [[pagedHandler()_1]] - code - dpdp-platform/backend/test/sync.e2e-spec.ts
- [[startRecordsServer()]] - code - dpdp-platform/backend/test/data-sources.e2e-spec.ts
- [[startRecordsServer()_1]] - code - dpdp-platform/backend/test/mappings.e2e-spec.ts
- [[startServer()]] - code - dpdp-platform/backend/test/step6-conflict-acceptance.e2e-spec.ts
- [[startServer()_1]] - code - dpdp-platform/backend/test/sync.e2e-spec.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/MockHttpServer
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_rest-api.connector.ts]]
- 3 edges to [[_COMMUNITY_data-sources.service.ts]]
- 3 edges to [[_COMMUNITY_mappings.e2e-spec.ts]]
- 3 edges to [[_COMMUNITY_step6-conflict-acceptance.e2e-spec.ts]]
- 3 edges to [[_COMMUNITY_queues.module.ts]]
- 2 edges to [[_COMMUNITY_read-only-http.client.ts]]
- 1 edge to [[_COMMUNITY_connector.factory.ts]]

## Top bridge nodes
- [[MockHttpServer]] - degree 16, connects to 7 communities
- [[jsonHandler()]] - degree 6, connects to 4 communities
- [[startRecordsServer()]] - degree 4, connects to 1 community
- [[startRecordsServer()_1]] - degree 4, connects to 1 community
- [[startServer()]] - degree 4, connects to 1 community