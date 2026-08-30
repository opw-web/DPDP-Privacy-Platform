---
type: community
members: 6
---

# 2. ARCHITECTURE

**Members:** 6 nodes

## Members
- [[2. ARCHITECTURE_1]] - document - DPDP_MVP2_COMPLIANCE_OPERATIONS.md
- [[2.1 New packages (everything from MVP 1 stays)]] - document - DPDP_MVP2_COMPLIANCE_OPERATIONS.md
- [[2.2 New Prisma models (all MVP 1 models unchanged)]] - document - DPDP_MVP2_COMPLIANCE_OPERATIONS.md
- [[2.3 Raw SQL follow-up migration]] - document - DPDP_MVP2_COMPLIANCE_OPERATIONS.md
- [[2.4 Seeded compliance rules — defaults for a DPO to review, not legal advice]] - document - DPDP_MVP2_COMPLIANCE_OPERATIONS.md
- [[2.5 Background jobs (added to the MVP 1 BullMQ setup)]] - document - DPDP_MVP2_COMPLIANCE_OPERATIONS.md

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/2_ARCHITECTURE
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_DPDP PLATFORM — MVP 2 COMPLIANCE OPERATIONS]]

## Top bridge nodes
- [[2. ARCHITECTURE_1]] - degree 6, connects to 1 community