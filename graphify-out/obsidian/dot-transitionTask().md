---
source_file: "dpdp-platform/backend/src/modules/retention/retention-scan.service.ts"
type: "code"
community: "RetentionScanService"
location: "L413"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/RetentionScanService
---

# .transitionTask()

## Connections
- [[dot-applyLegalHolds()]] - `calls` [EXTRACTED]
- [[dot-promoteFromFloor()]] - `calls` [EXTRACTED]
- [[dot-promoteNoticeSentToReady()]] - `calls` [EXTRACTED]
- [[dot-record()]] - `calls` [INFERRED]
- [[dot-releaseLegalHolds()]] - `calls` [EXTRACTED]
- [[AuditAction]] - `references` [EXTRACTED]
- [[RetentionScanService]] - `method` [EXTRACTED]
- [[lockRetentionWorkflow()]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/RetentionScanService