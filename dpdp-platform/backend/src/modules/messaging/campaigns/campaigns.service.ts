import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AgeStatus, DeliveryChannel, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../../common/audit/audit.service";
import { ReferenceService } from "../../../common/reference/reference.service";
import type { ScopedTransactionClient } from "../../../common/prisma/scoped-transaction-client";
import type { AccessTokenPayload } from "../../auth/token.service";
import { TemplatesService } from "../templates/templates.service";
import {
  DisallowedTemplateSyntaxError,
  MissingOrganizationContactError,
  MissingRequiredVariableError,
  TemplateRenderError,
  UnknownTemplateVariableError,
  extractTemplateVariables,
  renderOrganizationMessageTemplate,
} from "../templates/template-renderer";
import type { TemplateVariableName } from "../templates/whitelisted-variables";
import { compileAudience } from "../audience/compile-audience";
import { AudienceFilterError } from "../audience/audience-filter.error";
import type { AudienceFilter } from "../audience/audience-filter.types";
import { NoticesService } from "../../notices/notices.service";
import { ConsentsService } from "../../consents/consents.service";
import {
  recordNonDisclosureSuppression,
  type ActiveNonDisclosureDirection,
} from "../../board/non-disclosure";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import {
  CampaignSendQueueService,
  type CampaignSendJobData,
} from "../../../queues/campaign-send.queue";

/**
 * s.9(3): a child cannot self-determine marketing consent, and a
 * guardian-represented adult is, by this project's own deliberate
 * widening of the spec's pseudocode (already established by Task 4's
 * `AudienceService`, `CHILD_LIKE_AGE_STATUSES`), treated the same way.
 * `AgeStatus` has FOUR values, not three.
 */
const CHILD_LIKE_AGE_STATUSES: readonly AgeStatus[] = [
  "CHILD",
  "GUARDIAN_REPRESENTED",
];

/** Spec §4.8 guard 5, transcribed verbatim: these five categories "ignore
 * marketing consent entirely" and are never child/consent filtered --
 * only universal guard 6 (non-disclosure) applies to them. */
const COMPLIANCE_CATEGORIES = new Set([
  "COMPLIANCE_NOTICE",
  "BREACH_NOTICE",
  "REQUEST_UPDATE",
  "PRE_ERASURE_NOTICE",
  "NOTICE",
]);

/** Recipient counts above this require approval by a different employee
 * (guard 7), regardless of category. Every BREACH_NOTICE requires
 * approval regardless of count -- see `requiresApproval()`. Not a
 * statutory number -- an operational threshold named per this
 * codebase's "no bare literals" convention. */
const CAMPAIGN_APPROVAL_RECIPIENT_THRESHOLD = 500;

export const SUPPRESS_NO_CONSENT = "NO_CONSENT";
export const SUPPRESS_CHILD_MARKETING_PROHIBITED = "CHILD_MARKETING_PROHIBITED";
export const SUPPRESS_NON_DISCLOSURE_ORDER = "NON_DISCLOSURE_ORDER";

export const CAMPAIGN_PUBLIC_SELECT = {
  id: true,
  reference: true,
  name: true,
  category: true,
  templateId: true,
  subject: true,
  bodyMarkdown: true,
  audienceFilter: true,
  purposeId: true,
  noticeVersionId: true,
  breachId: true,
  status: true,
  recipientCount: true,
  sentCount: true,
  failedCount: true,
  suppressedCount: true,
  createdByEmployeeId: true,
  approvedByEmployeeId: true,
  approvedAt: true,
  sentAt: true,
  createdAt: true,
} satisfies Prisma.MessageCampaignSelect;

export type PublicCampaign = Prisma.MessageCampaignGetPayload<{
  select: typeof CAMPAIGN_PUBLIC_SELECT;
}>;

export const CAMPAIGN_RECIPIENT_PUBLIC_SELECT = {
  id: true,
  campaignId: true,
  dataPrincipalId: true,
  channel: true,
  address: true,
  status: true,
  suppressReason: true,
  renderedSubject: true,
  renderedBody: true,
  sentAt: true,
  failureReason: true,
} satisfies Prisma.CampaignRecipientSelect;

export type PublicCampaignRecipient = Prisma.CampaignRecipientGetPayload<{
  select: typeof CAMPAIGN_RECIPIENT_PUBLIC_SELECT;
}>;

interface ResolvedRecipient {
  dataPrincipalId: string;
  displayName: string;
  email: string | null;
  suppressReason: string | null;
  /** Set only when `suppressReason === SUPPRESS_NON_DISCLOSURE_ORDER` --
   * the specific `InformationRequest` direction responsible, so `send()`
   * can write BD-04's second obligation (the internal audit record of
   * the suppression, carrying the authorisation reference) via the
   * SAME `recordNonDisclosureSuppression` helper Task 13's evidence
   * module uses, inside the same transaction as the suppressed
   * `CampaignRecipient` row it documents. */
  nonDisclosureDirection?: ActiveNonDisclosureDirection;
}

/** Maps a `TemplateRenderError` (or its `AudienceFilterError` cousin) to
 * the Nest HTTP exception this module surfaces -- same pattern
 * `templates.service.ts`'s `toBadRequest` and `audience.service.ts`'s
 * `compile()` already established. */
function toBadRequest(err: unknown): never {
  if (err instanceof TemplateRenderError || err instanceof AudienceFilterError) {
    throw new BadRequestException(err.message);
  }
  throw err;
}

function notFoundCampaign(id: string): NotFoundException {
  return new NotFoundException(`Campaign "${id}" not found.`);
}

/**
 * Draft -> Preview (via Task 4's `POST /api/audiences/preview`, not this
 * service) -> approval -> Send -> per-recipient records (spec §4.8).
 *
 * Imports Task 4's `compileAudience` UNMODIFIED for every non-BREACH_NOTICE
 * category -- "Preview and send call the identical compiler" (spec line
 * 752). BREACH_NOTICE never calls it: guard 3 requires its recipients
 * come only from `BreachAffectedPrincipal`.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly referenceService: ReferenceService,
    private readonly templatesService: TemplatesService,
    private readonly noticesService: NoticesService,
    private readonly consentsService: ConsentsService,
    private readonly campaignSendQueueService: CampaignSendQueueService,
  ) {}

  async list(): Promise<PublicCampaign[]> {
    return this.prisma.scoped.messageCampaign.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: CAMPAIGN_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicCampaign> {
    const found = await this.prisma.scoped.messageCampaign.findFirst({
      where: { id },
      select: CAMPAIGN_PUBLIC_SELECT,
    });
    if (!found) {
      throw notFoundCampaign(id);
    }
    return found;
  }

  async listRecipients(campaignId: string): Promise<PublicCampaignRecipient[]> {
    const campaign = await this.prisma.scoped.messageCampaign.findFirst({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) {
      throw notFoundCampaign(campaignId);
    }
    return this.prisma.scoped.campaignRecipient.findMany({
      where: { campaignId },
      select: CAMPAIGN_RECIPIENT_PUBLIC_SELECT,
    });
  }

  // ─────────────────────────── create ───────────────────────────

  async create(
    dto: CreateCampaignDto,
    actor: AccessTokenPayload,
  ): Promise<PublicCampaign> {
    const isBreach = dto.category === "BREACH_NOTICE";

    // Guard 3: BREACH_NOTICE requires breachId, and recipients come ONLY
    // from BreachAffectedPrincipal -- a free-form filter is refused, not
    // silently ignored.
    if (isBreach) {
      if (!dto.breachId) {
        throw new BadRequestException(
          "category BREACH_NOTICE requires breachId (guard 3).",
        );
      }
      if (dto.audienceFilter) {
        throw new BadRequestException(
          "category BREACH_NOTICE never accepts audienceFilter -- its " +
            "recipients come only from BreachAffectedPrincipal (guard 3).",
        );
      }
      const breach = await this.prisma.scoped.breachIncident.findFirst({
        where: { id: dto.breachId },
        select: { id: true },
      });
      if (!breach) {
        throw new NotFoundException(`Breach incident "${dto.breachId}" not found.`);
      }
    } else if (!dto.audienceFilter) {
      throw new BadRequestException(
        `category ${dto.category} requires audienceFilter.`,
      );
    }

    // Guard 1: MARKETING requires purposeId.
    if (dto.category === "MARKETING" && !dto.purposeId) {
      throw new BadRequestException(
        "category MARKETING requires purposeId (guard 1).",
      );
    }

    // Guard 4: CONSENT_REQUEST requires purposeId AND a published notice.
    let noticeVersionId: string | null = null;
    if (dto.category === "CONSENT_REQUEST") {
      if (!dto.purposeId) {
        throw new BadRequestException(
          "category CONSENT_REQUEST requires purposeId (guard 4).",
        );
      }
      if (!dto.noticeId) {
        throw new BadRequestException(
          "category CONSENT_REQUEST requires noticeId (guard 4).",
        );
      }
      const published = await this.noticesService.getPublishedVersion(dto.noticeId);
      if (!published) {
        // NT-01: notice precedes consent -- structurally enforced here.
        throw new BadRequestException(
          `Notice "${dto.noticeId}" has no published version. A ` +
            "CONSENT_REQUEST campaign cannot be created before its " +
            "notice is published (NT-01).",
        );
      }
      noticeVersionId = published.noticeVersionId;
    }

    // MARKETING's purposeId must be a real CONSENT-basis purpose --
    // resolved eagerly (via ConsentsService's own LB-06 gate) so a bad
    // purposeId fails at creation, not silently at send time.
    if (dto.category === "MARKETING" && dto.purposeId) {
      await this.consentsService.getConsentStatus(
        // Probe with a sentinel id: getConsentStatus's purpose-gate
        // (assertConsentPurpose) runs before it ever looks at the
        // principal id, so this validates purposeId alone. A id that
        // matches no real principal simply returns null, which is
        // discarded -- only the LB-06 gate's exception (or lack of one)
        // matters here.
        "00000000-0000-0000-0000-000000000000",
        dto.purposeId,
      );
    }

    // Resolve subject/bodyMarkdown/requiredVariables: either snapshotted
    // from an existing template, or ad-hoc text validated the same way
    // `TemplatesService.create()` validates a new template's text.
    let subject: string;
    let bodyMarkdown: string;
    let requiredVariables: string[];
    if (dto.templateId) {
      const template = await this.templatesService.get(dto.templateId);
      subject = template.subject;
      bodyMarkdown = template.bodyMarkdown;
      requiredVariables = template.requiredVariables;
    } else {
      if (!dto.subject || !dto.bodyMarkdown) {
        throw new BadRequestException(
          "Either templateId, or both subject and bodyMarkdown, is required.",
        );
      }
      subject = dto.subject;
      bodyMarkdown = dto.bodyMarkdown;
      requiredVariables = dto.requiredVariables ?? [];
      const referenced = this.extractAndValidateVariables(subject, bodyMarkdown);
      // `referenced` is typed `TemplateVariableName[]` (the renderer's
      // closed whitelist union) because `extractAndValidateVariables`
      // guarantees every entry is whitelisted; `requiredVariables` here
      // is the DTO's plain `string[]` (not yet known to be whitelisted --
      // that is exactly what this membership check is establishing). The
      // `Set` is deliberately typed `Set<string>`, not
      // `Set<TemplateVariableName>`: `TemplateVariableName[]` is freely
      // assignable to `string[]` (a closed string-literal union is a
      // subtype of `string`), so this loses no type safety, and it lets
      // `.has(v)` accept a plain `string` -- mirroring exactly how
      // `TemplatesService.validateRequiredSubsetOfReferenced` types its
      // own `referenced: readonly string[]` parameter for the identical
      // comparison.
      const referencedSet = new Set<string>(referenced);
      const notReferenced = requiredVariables.filter((v) => !referencedSet.has(v));
      if (notReferenced.length > 0) {
        throw new BadRequestException(
          `requiredVariables lists ${notReferenced
            .map((v) => `"${v}"`)
            .join(", ")}, which subject/bodyMarkdown never reference.`,
        );
      }
    }

    // recipientCount, computed once at creation -- drives the approval
    // threshold (guard 7) and is never silently re-derived later so that
    // an approval already granted cannot be invalidated by the audience
    // shifting under it before send.
    let recipientCount: number;
    if (isBreach) {
      recipientCount = await this.prisma.scoped.breachAffectedPrincipal.count({
        where: { breachId: dto.breachId! },
      });
    } else {
      const where = this.compileFilter(dto.audienceFilter!);
      recipientCount = await this.prisma.scoped.dataPrincipal.count({ where });
    }

    const requiresApproval =
      isBreach || recipientCount > CAMPAIGN_APPROVAL_RECIPIENT_THRESHOLD;

    const reference = `CMP-${(await this.referenceService.next("CAMPAIGN"))
      .toString()
      .padStart(6, "0")}`;

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.messageCampaign.create({
        data: {
          reference,
          name: dto.name,
          category: dto.category,
          templateId: dto.templateId ?? null,
          subject,
          bodyMarkdown,
          audienceFilter: isBreach ? {} : (dto.audienceFilter as Prisma.InputJsonValue),
          purposeId: dto.purposeId ?? null,
          noticeVersionId,
          breachId: dto.breachId ?? null,
          status: requiresApproval ? "PENDING_APPROVAL" : "DRAFT",
          recipientCount,
          createdByEmployeeId: actor.sub,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime (verbatim idiom,
          // recipients.service.ts:~145).
        } as never,
        select: CAMPAIGN_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "CAMPAIGN_CREATED",
        resourceType: "MessageCampaign",
        resourceId: created.id,
        metadata: {
          category: created.category,
          reference: created.reference,
          recipientCount,
          requiresApproval,
          purposeId: created.purposeId,
          breachId: created.breachId,
          requiredVariables,
        },
      });

      return created;
    });
  }

  private extractAndValidateVariables(
    subject: string,
    bodyMarkdown: string,
  ): TemplateVariableName[] {
    try {
      const subjectVars = extractTemplateVariables(subject);
      const bodyVars = extractTemplateVariables(bodyMarkdown);
      return [...new Set([...subjectVars, ...bodyVars])];
    } catch (err) {
      if (
        err instanceof UnknownTemplateVariableError ||
        err instanceof DisallowedTemplateSyntaxError
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  private compileFilter(filter: unknown): Prisma.DataPrincipalWhereInput {
    try {
      return compileAudience(filter as AudienceFilter);
    } catch (err) {
      toBadRequest(err);
    }
  }

  // ─────────────────────────── approve ───────────────────────────

  /**
   * Guard 7: "Campaigns over 500 recipients, and every BREACH_NOTICE,
   * require approval by a DIFFERENT employee. The creator cannot approve
   * their own." Route-level permission is `CAN_SEND_BREACH_NOTICES`
   * (spec line 868, transcribed verbatim -- every campaign requiring
   * approval, not only BREACH_NOTICE ones, is gated behind this single
   * permission at the HTTP layer).
   */
  async approve(id: string, actor: AccessTokenPayload): Promise<PublicCampaign> {
    const campaign = await this.prisma.scoped.messageCampaign.findFirst({
      where: { id },
    });
    if (!campaign) {
      throw notFoundCampaign(id);
    }
    if (campaign.status !== "PENDING_APPROVAL") {
      throw new ConflictException(
        `Campaign "${id}" is ${campaign.status}, not PENDING_APPROVAL -- ` +
          "nothing to approve.",
      );
    }
    if (campaign.createdByEmployeeId === actor.sub) {
      throw new ForbiddenException(
        "The creator of a campaign cannot approve their own campaign " +
          "(guard 7).",
      );
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.messageCampaign.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedByEmployeeId: actor.sub,
          approvedAt: new Date(),
        },
        select: CAMPAIGN_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "CAMPAIGN_APPROVED",
        resourceType: "MessageCampaign",
        resourceId: id,
        metadata: {
          approvedByEmployeeId: actor.sub,
          createdByEmployeeId: campaign.createdByEmployeeId,
        },
      });

      return updated;
    });
  }

  // ─────────────────────────── send ───────────────────────────

  async send(
    id: string,
    actor: AccessTokenPayload,
    actorPermissions: ReadonlySet<string>,
  ): Promise<PublicCampaign> {
    const campaign = await this.prisma.scoped.messageCampaign.findFirst({
      where: { id },
    });
    if (!campaign) {
      throw notFoundCampaign(id);
    }

    // Check 16 / guard 8 (campaign-level half): a second send is refused
    // outright.
    if (campaign.status === "SENDING" || campaign.status === "SENT") {
      throw new ConflictException(
        `Campaign "${id}" is already ${campaign.status} -- a campaign ` +
          "can only be sent once.",
      );
    }
    if (campaign.status === "PENDING_APPROVAL") {
      throw new ConflictException(
        `Campaign "${id}" requires approval before it can be sent (guard 7).`,
      );
    }
    if (campaign.status !== "DRAFT" && campaign.status !== "APPROVED") {
      throw new ConflictException(
        `Campaign "${id}" is ${campaign.status} and cannot be sent.`,
      );
    }

    // Guard 3: BREACH_NOTICE requires CAN_SEND_BREACH_NOTICES on the
    // actor actually triggering the send (independent of who created or
    // approved it, and independent of the route's own base
    // CAN_SEND_MESSAGES permission).
    if (campaign.category === "BREACH_NOTICE") {
      if (!campaign.breachId) {
        throw new BadRequestException(
          "BREACH_NOTICE campaign has no breachId (guard 3) -- refusing to send.",
        );
      }
      if (!actorPermissions.has("CAN_SEND_BREACH_NOTICES")) {
        throw new ForbiddenException(
          "Sending a BREACH_NOTICE campaign requires CAN_SEND_BREACH_NOTICES (guard 3).",
        );
      }
    }

    const resolved = await this.resolveRecipients(campaign);

    const org = await this.prisma.scoped.organization.findFirstOrThrow();
    const [purpose, noticeVersion, breach] = await Promise.all([
      campaign.purposeId
        ? this.prisma.scoped.processingPurpose.findFirst({
            where: { id: campaign.purposeId },
            select: { name: true },
          })
        : Promise.resolve(null),
      campaign.noticeVersionId
        ? this.prisma.scoped.noticeVersion.findFirst({
            where: { id: campaign.noticeVersionId },
          })
        : Promise.resolve(null),
      campaign.breachId
        ? this.prisma.scoped.breachIncident.findFirst({
            where: { id: campaign.breachId },
          })
        : Promise.resolve(null),
    ]);

    const organizationContact = {
      dpoName: org.dpoName,
      dpoEmail: org.dpoEmail,
      dpoPhone: org.dpoPhone,
      responsiblePersonName: org.responsiblePersonName,
      responsiblePersonEmail: org.responsiblePersonEmail,
      grievanceContactEmail: org.grievanceContactEmail,
    };
    const baseVariables: Partial<Record<TemplateVariableName, string>> = {
      company_name: org.name,
      reference: campaign.reference,
    };
    if (purpose) baseVariables.purpose_name = purpose.name;
    if (noticeVersion) {
      baseVariables.notice_version = String(noticeVersion.version);
      baseVariables.withdrawal_url = noticeVersion.withdrawalUrl;
      baseVariables.rights_url = noticeVersion.rightsUrl;
      baseVariables.board_complaint_url = noticeVersion.boardComplaintUrl;
    }
    if (breach) {
      baseVariables.breach_reference = breach.reference;
      if (breach.natureExtentTiming) baseVariables.breach_nature_extent_timing = breach.natureExtentTiming;
      if (breach.consequences) baseVariables.breach_consequences = breach.consequences;
      if (breach.mitigationMeasures) baseVariables.breach_mitigation = breach.mitigationMeasures;
      if (breach.safetyMeasuresForPrincipals) baseVariables.breach_safety_measures = breach.safetyMeasuresForPrincipals;
      if (breach.responderContact) baseVariables.breach_responder_contact = breach.responderContact;
    }
    const contactEmail =
      org.grievanceContactEmail ?? org.dpoEmail ?? org.responsiblePersonEmail;
    if (contactEmail) baseVariables.contact_email = contactEmail;
    if (org.publicPrivacyPageUrl) baseVariables.portal_link = org.publicPrivacyPageUrl;

    const campaignRequiredVariables = campaign.templateId
      ? (await this.templatesService.get(campaign.templateId)).requiredVariables
      : [];

    // Render EVERY to-be-delivered recipient's content BEFORE opening any
    // transaction: "A campaign whose template fails to render must
    // refuse to send, not send a partial message" -- a throw here aborts
    // the whole send with nothing written to the database at all.
    const toDeliver: Array<{
      recipient: ResolvedRecipient;
      renderedSubject: string;
      renderedBody: string;
    }> = [];
    for (const recipient of resolved) {
      if (recipient.suppressReason) continue;
      try {
        const rendered = renderOrganizationMessageTemplate({
          subjectSource: campaign.subject,
          bodySource: campaign.bodyMarkdown,
          requiredVariables: campaignRequiredVariables,
          variables: { ...baseVariables, principal_name: recipient.displayName },
          organization: organizationContact,
        });
        toDeliver.push({
          recipient,
          renderedSubject: rendered.subject,
          renderedBody: rendered.body,
        });
      } catch (err) {
        if (
          err instanceof MissingRequiredVariableError ||
          err instanceof UnknownTemplateVariableError ||
          err instanceof DisallowedTemplateSyntaxError ||
          err instanceof MissingOrganizationContactError
        ) {
          toBadRequest(err);
        }
        throw err;
      }
    }

    const suppressed = resolved.filter((r) => r.suppressReason);

    const jobsToEnqueue: CampaignSendJobData[] = [];
    const updated = await this.prisma.scoped.$transaction(async (tx) => {
      for (const s of suppressed) {
        await tx.campaignRecipient.create({
          data: {
            campaignId: id,
            dataPrincipalId: s.dataPrincipalId,
            channel: "PORTAL",
            address: s.email,
            status: "SUPPRESSED",
            suppressReason: s.suppressReason,
          } as never,
        });
        // BD-04's second half: a non-disclosure suppression is ALSO an
        // internal audit event carrying the authorisation reference --
        // "internal accountability and external non-disclosure are
        // different things." Same helper, same action
        // (`NON_DISCLOSURE_SUPPRESSION_APPLIED`), same transaction
        // discipline `evidence/non-disclosure.ts` already uses.
        if (s.suppressReason === SUPPRESS_NON_DISCLOSURE_ORDER && s.nonDisclosureDirection) {
          await recordNonDisclosureSuppression(tx, this.auditService, {
            direction: s.nonDisclosureDirection,
            dataPrincipalId: s.dataPrincipalId,
            context: "campaign-send",
          });
        }
      }
      for (const d of toDeliver) {
        await tx.campaignRecipient.create({
          data: {
            campaignId: id,
            dataPrincipalId: d.recipient.dataPrincipalId,
            channel: "PORTAL",
            address: d.recipient.email,
            status: "PENDING",
            renderedSubject: d.renderedSubject,
            renderedBody: d.renderedBody,
          } as never,
        });
        jobsToEnqueue.push({
          campaignId: id,
          dataPrincipalId: d.recipient.dataPrincipalId,
          channel: "PORTAL",
          organizationId: campaign.organizationId,
          triggeredBy: actor.sub,
        });
      }

      const nextStatus = toDeliver.length === 0 ? "SENT" : "SENDING";
      const result = await tx.messageCampaign.update({
        where: { id },
        data: {
          status: nextStatus,
          recipientCount: resolved.length,
          suppressedCount: suppressed.length,
          sentAt: new Date(),
        },
        select: CAMPAIGN_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "CAMPAIGN_SENT",
        resourceType: "MessageCampaign",
        resourceId: id,
        metadata: {
          category: campaign.category,
          totalRecipients: resolved.length,
          suppressedCount: suppressed.length,
          pendingCount: toDeliver.length,
          suppressReasons: suppressed.reduce<Record<string, number>>((acc, s) => {
            const key = s.suppressReason!;
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {}),
        },
      });

      return result;
    });

    // Enqueue jobs AFTER the transaction commits -- the same discipline
    // `SyncQueueService`/every other queue-backed service in this
    // codebase follows: a worker must never be able to pick up a job for
    // a `CampaignRecipient` row that isn't actually committed yet.
    for (const job of jobsToEnqueue) {
      await this.campaignSendQueueService.enqueue(job);
    }

    return updated;
  }

  /**
   * Guards 1, 2, 5, 6 (guard 3/4's category-level requirements are
   * enforced by `create()`/`send()` themselves, before this runs; guard
   * 4's CONSENT_REQUEST is deliberately NOT consent-filtered here).
   *
   * Order: guard 6 (non-disclosure, universal, checked first for every
   * category) -> guard 2 (MARKETING child/guardian exclusion) -> guard 1
   * (MARKETING consent intersection). Compliance categories (guard 5)
   * and CONSENT_REQUEST never reach guards 1/2 at all.
   */
  private async resolveRecipients(
    campaign: Prisma.MessageCampaignGetPayload<Record<string, never>>,
  ): Promise<ResolvedRecipient[]> {
    type Candidate = {
      id: string;
      displayName: string;
      ageStatus: AgeStatus;
      fields: { value: string }[];
    };

    let candidates: Candidate[];
    if (campaign.category === "BREACH_NOTICE") {
      const affected = await this.prisma.scoped.breachAffectedPrincipal.findMany({
        where: { breachId: campaign.breachId! },
        select: { dataPrincipalId: true },
      });
      const ids = affected.map((a) => a.dataPrincipalId);
      candidates = await this.prisma.scoped.dataPrincipal.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          displayName: true,
          ageStatus: true,
          fields: {
            where: { canonicalField: "EMAIL" },
            select: { value: true },
            orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
            take: 1,
          },
        },
      });
    } else {
      const where = this.compileFilter(campaign.audienceFilter);
      candidates = await this.prisma.scoped.dataPrincipal.findMany({
        where,
        select: {
          id: true,
          displayName: true,
          ageStatus: true,
          fields: {
            where: { canonicalField: "EMAIL" },
            select: { value: true },
            orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
            take: 1,
          },
        },
      });
    }

    // Guard 6: active non-disclosure orders suppress the named principal
    // from EVERY category, including BREACH_NOTICE and the compliance
    // categories (BD-04). "Active" is exactly `nonDisclosureDirected:
    // true` naming the principal in `affectedPrincipalIds` -- the SAME
    // shape `board/non-disclosure.ts` (Task 13) and
    // `evidence/non-disclosure.ts` (Task 12) both use, verbatim, so all
    // three agree on what "active" means. `InformationRequest` carries
    // no expiry/withdrawal column for a direction, so `respondedAt` is
    // NOT part of that definition -- a request being answered does not
    // lift a standing non-disclosure direction. Fetched here as one bulk
    // query (rather than calling `findActiveNonDisclosureDirections` once
    // per candidate) because an audience can run to thousands of
    // principals; the filter and the resulting per-principal shape are
    // identical to that helper's.
    const nonDisclosureOrders = await this.prisma.scoped.informationRequest.findMany({
      where: { nonDisclosureDirected: true },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        reference: true,
        nonDisclosurePermissionRef: true,
        affectedPrincipalIds: true,
      },
    });
    const nonDisclosureMap = new Map<string, ActiveNonDisclosureDirection>();
    for (const order of nonDisclosureOrders) {
      const direction: ActiveNonDisclosureDirection = {
        informationRequestId: order.id,
        reference: order.reference,
        authorisationRef: order.nonDisclosurePermissionRef ?? "",
      };
      for (const principalId of order.affectedPrincipalIds) {
        // `orderBy: receivedAt desc` + "first write wins" keeps the
        // MOST RECENT direction when a principal is named by more than
        // one -- same tie-break `findActiveNonDisclosureDirections`
        // documents (its callers read index 0 of its newest-first list).
        if (!nonDisclosureMap.has(principalId)) {
          nonDisclosureMap.set(principalId, direction);
        }
      }
    }

    let grantedSet: Set<string> | null = null;
    if (campaign.category === "MARKETING") {
      const granted = await this.consentsService.findGrantedPrincipalIds(
        campaign.purposeId!,
      );
      grantedSet = new Set(granted);
    }

    return candidates.map((c): ResolvedRecipient => {
      const email = c.fields[0]?.value ?? null;
      const direction = nonDisclosureMap.get(c.id);
      if (direction) {
        return {
          dataPrincipalId: c.id,
          displayName: c.displayName,
          email,
          suppressReason: SUPPRESS_NON_DISCLOSURE_ORDER,
          nonDisclosureDirection: direction,
        };
      }
      if (campaign.category === "MARKETING") {
        if (CHILD_LIKE_AGE_STATUSES.includes(c.ageStatus)) {
          return {
            dataPrincipalId: c.id,
            displayName: c.displayName,
            email,
            suppressReason: SUPPRESS_CHILD_MARKETING_PROHIBITED,
          };
        }
        if (!grantedSet!.has(c.id)) {
          return {
            dataPrincipalId: c.id,
            displayName: c.displayName,
            email,
            suppressReason: SUPPRESS_NO_CONSENT,
          };
        }
      }
      return {
        dataPrincipalId: c.id,
        displayName: c.displayName,
        email,
        suppressReason: null,
      };
    });
  }

  // ─────────────────── delivery (called by the processor) ───────────────────

  /**
   * Delivers ONE recipient's already-rendered, already-frozen content.
   * Idempotent (guard 8): a `CampaignRecipient` row not in `PENDING`
   * status is a no-op, whatever re-triggered this call (BullMQ retry, a
   * duplicate manual enqueue, ...). `isFinalAttempt` is supplied by the
   * processor (from `job.attemptsMade`/`job.opts.attempts`) -- only on
   * the last allowed attempt does a delivery failure get written back as
   * a terminal `FAILED` row; every earlier attempt leaves the row
   * `PENDING` so a subsequent retry still sees it as eligible.
   */
  async deliverRecipient(
    data: CampaignSendJobData,
    isFinalAttempt: boolean,
    notificationsService: {
      send(input: {
        audience: "PRINCIPAL";
        dataPrincipalId: string;
        title: string;
        body: string;
        severity?: "INFO" | "WARNING" | "CRITICAL";
        campaignId?: string;
        emailAddress?: string | null;
      }): Promise<unknown>;
    },
  ): Promise<void> {
    const recipient = await this.prisma.scoped.campaignRecipient.findFirst({
      where: {
        campaignId: data.campaignId,
        dataPrincipalId: data.dataPrincipalId,
        channel: data.channel,
      },
    });
    if (!recipient || recipient.status !== "PENDING") {
      return;
    }

    const campaign = await this.prisma.scoped.messageCampaign.findFirst({
      where: { id: data.campaignId },
      select: { id: true, category: true, breachId: true },
    });
    if (!campaign) {
      return;
    }

    try {
      await notificationsService.send({
        audience: "PRINCIPAL",
        dataPrincipalId: data.dataPrincipalId,
        title: recipient.renderedSubject ?? "",
        body: recipient.renderedBody ?? "",
        severity: "INFO",
        campaignId: campaign.id,
        emailAddress: recipient.address ?? undefined,
      });

      await this.prisma.scoped.$transaction(async (tx) => {
        await tx.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "DELIVERED", sentAt: new Date() },
        });
        await tx.principalContactEvent.create({
          data: {
            dataPrincipalId: data.dataPrincipalId,
            direction: "OUTBOUND",
            channel: "CAMPAIGN_OUT",
            description: `Campaign ${campaign.id} (${campaign.category})`,
            // GO-09: OUTBOUND campaign delivery must NEVER touch
            // DataPrincipal.lastPrincipalContactAt -- that field records
            // the principal approaching the company (s.8(8)), and this
            // write intentionally does not touch it.
          } as never,
        });
        // BR-13 evidence: a BREACH_NOTICE delivery also records its
        // BreachAffectedPrincipal row's notifiedAt/notificationChannel/
        // campaignRecipientId -- this IS the interface Task 14's Board
        // report reads back (see campaigns.module.ts's doc comment).
        if (campaign.category === "BREACH_NOTICE" && campaign.breachId) {
          await tx.breachAffectedPrincipal.updateMany({
            where: {
              breachId: campaign.breachId,
              dataPrincipalId: data.dataPrincipalId,
            },
            data: {
              notifiedAt: new Date(),
              notificationChannel: data.channel,
              campaignRecipientId: recipient.id,
            },
          });
        }
        await tx.messageCampaign.update({
          where: { id: campaign.id },
          data: { sentCount: { increment: 1 } },
        });
        await this.maybeFinalizeCampaign(tx, campaign.id);
      });
    } catch (err) {
      if (isFinalAttempt) {
        await this.prisma.scoped.$transaction(async (tx) => {
          await tx.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "FAILED",
              sentAt: new Date(),
              failureReason:
                err instanceof Error ? err.message.slice(0, 500) : "unknown error",
            },
          });
          await tx.messageCampaign.update({
            where: { id: campaign.id },
            data: { failedCount: { increment: 1 } },
          });
          await this.maybeFinalizeCampaign(tx, campaign.id);
        });
      }
      throw err;
    }
  }

  private async maybeFinalizeCampaign(
    tx: ScopedTransactionClient,
    campaignId: string,
  ): Promise<void> {
    const pendingCount = await tx.campaignRecipient.count({
      where: { campaignId, status: "PENDING" },
    });
    if (pendingCount === 0) {
      await tx.messageCampaign.updateMany({
        where: { id: campaignId, status: "SENDING" },
        data: { status: "SENT" },
      });
    }
  }
}
