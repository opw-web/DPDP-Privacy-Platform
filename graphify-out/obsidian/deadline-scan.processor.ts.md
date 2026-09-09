---
source_file: "dpdp-platform/backend/src/queues/deadline-scan.processor.ts"
type: "code"
community: "requests.service.ts"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/requestsservicets
---

# deadline-scan.processor.ts

## Connections
- [[@nestjsbullmq_1]] - `imports_from` [EXTRACTED]
- [[@nestjscommon_1]] - `imports_from` [EXTRACTED]
- [[DEADLINE_SCAN_ACTOR_LABEL]] - `imports` [EXTRACTED]
- [[DEADLINE_SCAN_QUEUE_NAME]] - `imports` [EXTRACTED]
- [[DeadlineScanJobData]] - `imports` [EXTRACTED]
- [[DeadlineScanOrgResult]] - `imports` [EXTRACTED]
- [[DeadlineScanProcessor]] - `contains` [EXTRACTED]
- [[DeadlineScanSummary]] - `contains` [EXTRACTED]
- [[PrismaService]] - `imports` [EXTRACTED]
- [[RequestsService]] - `imports` [EXTRACTED]
- [[TenantContext]] - `imports` [EXTRACTED]
- [[TenantStore]] - `imports` [EXTRACTED]
- [[bullmq]] - `imports_from` [EXTRACTED]
- [[deadline-scan.queue.ts]] - `imports_from` [EXTRACTED]
- [[prisma.service.ts]] - `imports_from` [EXTRACTED]
- [[requests.constants.ts]] - `imports_from` [EXTRACTED]
- [[requests.e2e-spec.ts]] - `imports_from` [EXTRACTED]
- [[requests.module.ts]] - `imports_from` [EXTRACTED]
- [[requests.service.ts]] - `imports_from` [EXTRACTED]
- [[tenant-context.ts]] - `imports_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/requestsservicets