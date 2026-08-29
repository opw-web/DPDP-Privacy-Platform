---
type: community
members: 9
---

# System Architecture Setup

**Members:** 9 nodes

## Members
- [[2. ARCHITECTURE_1]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md
- [[2.1 Tech stack (locked — do not substitute)]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md
- [[2.2 Machine setup — Linux Mint Cinnamon (run these exactly)]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md
- [[2.3 Ports (locked)]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md
- [[2.4 Folder structure]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md
- [[2.5 Database schema — Prisma (source of truth)]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md
- [[2.6 Raw SQL Prisma cannot express (second migration)]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md
- [[2.7 docker-compose.yml and .env]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md
- [[2.8 The sync pipeline]] - document - DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/System_Architecture_Setup
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_MVP1 Foundation & Discovery]]

## Top bridge nodes
- [[2. ARCHITECTURE_1]] - degree 9, connects to 1 community