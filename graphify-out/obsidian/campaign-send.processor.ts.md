---
source_file: "dpdp-platform/backend/src/queues/campaign-send.processor.ts"
type: "code"
community: "breach-principal-notice-dispatch.processor.ts"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/breach-principal-notice-dispatchprocessorts
---

# campaign-send.processor.ts

## Connections
- [[@nestjsbullmq_1]] - `imports_from` [EXTRACTED]
- [[@nestjscommon_1]] - `imports_from` [EXTRACTED]
- [[CAMPAIGN_SEND_MAX_ATTEMPTS]] - `imports` [EXTRACTED]
- [[CAMPAIGN_SEND_QUEUE_NAME]] - `imports` [EXTRACTED]
- [[CAMPAIGN_SEND_WORKER_CONCURRENCY]] - `imports` [EXTRACTED]
- [[CampaignSendJobData]] - `imports` [EXTRACTED]
- [[CampaignSendProcessor]] - `contains` [EXTRACTED]
- [[CampaignsService]] - `imports` [EXTRACTED]
- [[NotificationsService]] - `imports` [EXTRACTED]
- [[PrismaService]] - `imports` [EXTRACTED]
- [[TenantContext]] - `imports` [EXTRACTED]
- [[TenantStore]] - `imports` [EXTRACTED]
- [[bullmq]] - `imports_from` [EXTRACTED]
- [[campaign-send.queue.ts]] - `imports_from` [EXTRACTED]
- [[campaigns.module.ts]] - `imports_from` [EXTRACTED]
- [[campaigns.service.ts]] - `imports_from` [EXTRACTED]
- [[notifications.service.ts]] - `imports_from` [EXTRACTED]
- [[prisma.service.ts]] - `imports_from` [EXTRACTED]
- [[tenant-context.ts]] - `imports_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/breach-principal-notice-dispatchprocessorts