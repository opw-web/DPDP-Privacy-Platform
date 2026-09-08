---
source_file: "dpdp-platform/backend/src/modules/breaches/breaches.module.ts"
type: "code"
community: "queues.module.ts"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/queuesmodulets
---

# breaches.module.ts

## Connections
- [[@nestjsbullmq_1]] - `imports_from` [EXTRACTED]
- [[@nestjscommon]] - `imports_from` [EXTRACTED]
- [[AuditModule]] - `imports` [EXTRACTED]
- [[BREACH_CLOCK_QUEUE_NAME]] - `imports` [EXTRACTED]
- [[BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME]] - `imports` [EXTRACTED]
- [[BreachClockProcessor]] - `imports` [EXTRACTED]
- [[BreachPrincipalNoticeDispatchProcessor]] - `imports` [EXTRACTED]
- [[BreachPrincipalNoticeDispatchQueueService]] - `imports` [EXTRACTED]
- [[BreachService]] - `imports` [EXTRACTED]
- [[BreachesController]] - `imports` [EXTRACTED]
- [[BreachesModule]] - `contains` [EXTRACTED]
- [[CAMPAIGN_SEND_QUEUE_NAME]] - `imports` [EXTRACTED]
- [[CampaignsModule]] - `imports` [EXTRACTED]
- [[ComplianceModule]] - `imports` [EXTRACTED]
- [[NotificationsModule]] - `imports` [EXTRACTED]
- [[QueuesModule]] - `imports` [EXTRACTED]
- [[ReferenceModule]] - `imports` [EXTRACTED]
- [[app.module.ts]] - `imports_from` [EXTRACTED]
- [[audit.module.ts]] - `imports_from` [EXTRACTED]
- [[breach-clock.processor.ts]] - `imports_from` [EXTRACTED]
- [[breach-principal-notice-dispatch.processor.ts]] - `imports_from` [EXTRACTED]
- [[breach-principal-notice-dispatch.queue.ts]] - `imports_from` [EXTRACTED]
- [[breach.service.ts]] - `imports_from` [EXTRACTED]
- [[breaches.controller.ts]] - `imports_from` [EXTRACTED]
- [[campaign-send.queue.ts]] - `imports_from` [EXTRACTED]
- [[campaigns.module.ts]] - `imports_from` [EXTRACTED]
- [[compliance.module.ts]] - `imports_from` [EXTRACTED]
- [[notifications.module.ts]] - `imports_from` [EXTRACTED]
- [[queues.module.ts]] - `imports_from` [EXTRACTED]
- [[reference.module.ts]] - `imports_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/queuesmodulets