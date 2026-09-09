---
source_file: "dpdp-platform/backend/src/queues/audit-chain-verify.processor.ts"
type: "code"
community: "queues.module.ts"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/queuesmodulets
---

# audit-chain-verify.processor.ts

## Connections
- [[@nestjsbullmq_1]] - `imports_from` [EXTRACTED]
- [[@nestjscommon]] - `imports_from` [EXTRACTED]
- [[ACCESS_LOG_RETENTION_QUEUE_NAME]] - `contains` [EXTRACTED]
- [[AUDIT_CHAIN_VERIFY_QUEUE_NAME]] - `contains` [EXTRACTED]
- [[AuditChainService]] - `imports` [EXTRACTED]
- [[AuditChainVerifyJobData]] - `contains` [EXTRACTED]
- [[AuditChainVerifyProcessor]] - `contains` [EXTRACTED]
- [[AuditChainVerifySummary]] - `contains` [EXTRACTED]
- [[NotificationsService]] - `imports` [EXTRACTED]
- [[PrismaService]] - `imports` [EXTRACTED]
- [[TenantContext]] - `imports` [EXTRACTED]
- [[TenantStore]] - `imports` [EXTRACTED]
- [[access-log-retention.processor.ts]] - `re_exports` [EXTRACTED]
- [[audit-chain.service.ts]] - `imports_from` [EXTRACTED]
- [[bullmq_1]] - `imports_from` [EXTRACTED]
- [[mvp2-schedules.ts]] - `imports_from` [EXTRACTED]
- [[notifications.service.ts]] - `imports_from` [EXTRACTED]
- [[prisma.service.ts]] - `imports_from` [EXTRACTED]
- [[queues.module.ts]] - `imports_from` [EXTRACTED]
- [[scheduled-jobs.e2e-spec.ts]] - `imports_from` [EXTRACTED]
- [[tenant-context.ts]] - `imports_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/queuesmodulets