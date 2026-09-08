---
source_file: "dpdp-platform/backend/src/modules/messaging/campaigns/campaigns.service.ts"
type: "code"
community: "campaigns.service.ts"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/campaignsservicets
---

# campaigns.service.ts

## Connections
- [[@nestjscommon]] - `imports_from` [EXTRACTED]
- [[@prismaclient]] - `imports_from` [EXTRACTED]
- [[AccessTokenPayload]] - `imports` [EXTRACTED]
- [[ActiveNonDisclosureDirection]] - `imports` [EXTRACTED]
- [[AudienceFilter_1]] - `imports` [EXTRACTED]
- [[AudienceFilterError]] - `imports` [EXTRACTED]
- [[AuditService]] - `imports` [EXTRACTED]
- [[CAMPAIGN_PUBLIC_SELECT]] - `contains` [EXTRACTED]
- [[CAMPAIGN_RECIPIENT_PUBLIC_SELECT]] - `contains` [EXTRACTED]
- [[CHILD_LIKE_AGE_STATUSES]] - `contains` [EXTRACTED]
- [[COMPLIANCE_CATEGORIES]] - `contains` [EXTRACTED]
- [[CampaignSendJobData]] - `imports` [EXTRACTED]
- [[CampaignSendQueueService]] - `imports` [EXTRACTED]
- [[CampaignsService]] - `contains` [EXTRACTED]
- [[ConsentsService]] - `imports` [EXTRACTED]
- [[CreateCampaignDto]] - `imports` [EXTRACTED]
- [[DisallowedTemplateSyntaxError]] - `imports` [EXTRACTED]
- [[MissingOrganizationContactError]] - `imports` [EXTRACTED]
- [[MissingRequiredVariableError]] - `imports` [EXTRACTED]
- [[NoticesService]] - `imports` [EXTRACTED]
- [[PrismaService]] - `imports` [EXTRACTED]
- [[PublicCampaign]] - `contains` [EXTRACTED]
- [[PublicCampaignRecipient]] - `contains` [EXTRACTED]
- [[ReferenceService]] - `imports` [EXTRACTED]
- [[ResolvedRecipient]] - `contains` [EXTRACTED]
- [[SUPPRESS_CHILD_MARKETING_PROHIBITED]] - `contains` [EXTRACTED]
- [[SUPPRESS_NON_DISCLOSURE_ORDER]] - `contains` [EXTRACTED]
- [[SUPPRESS_NO_CONSENT]] - `contains` [EXTRACTED]
- [[ScopedTransactionClient]] - `imports` [EXTRACTED]
- [[TemplateRenderError]] - `imports` [EXTRACTED]
- [[TemplateVariableName]] - `imports` [EXTRACTED]
- [[TemplatesService]] - `imports` [EXTRACTED]
- [[UnknownTemplateVariableError]] - `imports` [EXTRACTED]
- [[audience-filter.error.ts]] - `imports_from` [EXTRACTED]
- [[audience-filter.types.ts]] - `imports_from` [EXTRACTED]
- [[audit.service.ts]] - `imports_from` [EXTRACTED]
- [[boardnon-disclosure.ts]] - `imports_from` [EXTRACTED]
- [[breach.service.ts]] - `imports_from` [EXTRACTED]
- [[campaign-send.processor.ts]] - `imports_from` [EXTRACTED]
- [[campaign-send.queue.ts]] - `imports_from` [EXTRACTED]
- [[campaigns.controller.ts]] - `imports_from` [EXTRACTED]
- [[campaigns.e2e-spec.ts]] - `imports_from` [EXTRACTED]
- [[campaigns.module.ts]] - `imports_from` [EXTRACTED]
- [[compile-audience.ts]] - `imports_from` [EXTRACTED]
- [[compileAudience()]] - `imports` [EXTRACTED]
- [[consents.service.ts]] - `imports_from` [EXTRACTED]
- [[create-campaign.dto.ts]] - `imports_from` [EXTRACTED]
- [[extractTemplateVariables()]] - `imports` [EXTRACTED]
- [[notFoundCampaign()]] - `contains` [EXTRACTED]
- [[notices.service.ts]] - `imports_from` [EXTRACTED]
- [[prisma.service.ts]] - `imports_from` [EXTRACTED]
- [[recordNonDisclosureSuppression()]] - `imports` [EXTRACTED]
- [[reference.service.ts]] - `imports_from` [EXTRACTED]
- [[renderOrganizationMessageTemplate()]] - `imports` [EXTRACTED]
- [[scoped-transaction-client.ts]] - `imports_from` [EXTRACTED]
- [[template-renderer.ts]] - `imports_from` [EXTRACTED]
- [[templates.service.ts]] - `imports_from` [EXTRACTED]
- [[toBadRequest()_1]] - `contains` [EXTRACTED]
- [[token.service.ts]] - `imports_from` [EXTRACTED]
- [[whitelisted-variables.ts]] - `imports_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/campaignsservicets