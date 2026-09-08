---
source_file: "dpdp-platform/backend/src/modules/retention/erasure-task.service.ts"
type: "code"
community: "ErasureTaskService"
location: "L204"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/ErasureTaskService
---

# .createFromTrigger()

## Connections
- [[dot-applyStatusChange()]] - `calls` [INFERRED]
- [[dot-buildChecklists()]] - `calls` [EXTRACTED]
- [[dot-changeStatus()]] - `calls` [INFERRED]
- [[dot-computeDeadline()]] - `calls` [INFERRED]
- [[dot-createInactivityTasks()]] - `calls` [INFERRED]
- [[dot-createPurposeServedTasks()]] - `calls` [INFERRED]
- [[dot-findApplicableLegalHold()]] - `calls` [EXTRACTED]
- [[dot-mergeCompletionChecklist()]] - `calls` [EXTRACTED]
- [[dot-record()_1]] - `calls` [INFERRED]
- [[dot-resolveLastInboundContactAt()]] - `calls` [EXTRACTED]
- [[dot-resolveLastProcessingAt()]] - `calls` [EXTRACTED]
- [[dot-resolveRule()]] - `calls` [INFERRED]
- [[ErasureTaskService]] - `method` [EXTRACTED]
- [[ScopedTransactionClient]] - `references` [EXTRACTED]
- [[addByDeadlineUnit()]] - `calls` [EXTRACTED]
- [[addByRetentionUnit()]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/ErasureTaskService