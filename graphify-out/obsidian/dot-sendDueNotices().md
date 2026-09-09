---
source_file: "dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts"
type: "code"
community: "PreErasureNoticeService"
location: "L105"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/PreErasureNoticeService
---

# .sendDueNotices()

## Connections
- [[dot-createPortalInTransaction()]] - `calls` [INFERRED]
- [[dot-deliverEmailBestEffort()]] - `calls` [INFERRED]
- [[dot-record()_1]] - `calls` [INFERRED]
- [[dot-runForCurrentOrganization()_2]] - `calls` [EXTRACTED]
- [[PreErasureNoticeService]] - `method` [EXTRACTED]
- [[buildPreErasureNoticeBody()]] - `calls` [EXTRACTED]
- [[lockRetentionWorkflow()]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/PreErasureNoticeService