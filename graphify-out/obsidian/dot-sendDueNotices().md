---
source_file: "dpdp-platform/backend/src/modules/retention/pre-erasure-notice.service.ts"
type: "code"
community: "NotificationSendInput"
location: "L105"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/NotificationSendInput
---

# .sendDueNotices()

## Connections
- [[dot-createPortalInTransaction()]] - `calls` [INFERRED]
- [[dot-deliverEmailBestEffort()]] - `calls` [INFERRED]
- [[dot-record()]] - `calls` [INFERRED]
- [[dot-runForCurrentOrganization()_3]] - `calls` [EXTRACTED]
- [[PreErasureNoticeService]] - `method` [EXTRACTED]
- [[buildPreErasureNoticeBody()]] - `calls` [EXTRACTED]
- [[lockRetentionWorkflow()]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/NotificationSendInput