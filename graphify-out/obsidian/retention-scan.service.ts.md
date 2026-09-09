---
source_file: "dpdp-platform/backend/src/modules/retention/retention-scan.service.ts"
type: "code"
community: "prisma.service.ts"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/prismaservicets
---

# retention-scan.service.ts

## Connections
- [[@nestjscommon_1]] - `imports_from` [EXTRACTED]
- [[@prismaclient_1]] - `imports_from` [EXTRACTED]
- [[AuditAction]] - `imports` [EXTRACTED]
- [[AuditService]] - `imports` [EXTRACTED]
- [[ComplianceService]] - `imports` [EXTRACTED]
- [[ErasureTaskService]] - `imports` [EXTRACTED]
- [[LegalHoldScope]] - `imports` [EXTRACTED]
- [[OPEN_ERASURE_TASK_STATES_1]] - `contains` [EXTRACTED]
- [[PrismaService]] - `imports` [EXTRACTED]
- [[RetentionScanService]] - `contains` [EXTRACTED]
- [[RetentionScanSummary]] - `contains` [EXTRACTED]
- [[TenantContext]] - `imports` [EXTRACTED]
- [[TenantStore]] - `imports` [EXTRACTED]
- [[addByDeadlineUnit()]] - `imports` [EXTRACTED]
- [[audit-actions.ts]] - `imports_from` [EXTRACTED]
- [[audit.service.ts]] - `imports_from` [EXTRACTED]
- [[compliance.service.ts]] - `imports_from` [EXTRACTED]
- [[erasure-task.service.ts]] - `imports_from` [EXTRACTED]
- [[legal-hold-scope.util.ts]] - `imports_from` [EXTRACTED]
- [[legalHoldCovers()]] - `imports` [EXTRACTED]
- [[lockRetentionWorkflow()]] - `imports` [EXTRACTED]
- [[prisma.service.ts]] - `imports_from` [EXTRACTED]
- [[retention-scan.processor.ts]] - `imports_from` [EXTRACTED]
- [[retention-transaction-lock.util.ts]] - `imports_from` [EXTRACTED]
- [[retention.e2e-spec.ts]] - `imports_from` [EXTRACTED]
- [[retention.module.ts]] - `imports_from` [EXTRACTED]
- [[tenant-context.ts]] - `imports_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/prismaservicets