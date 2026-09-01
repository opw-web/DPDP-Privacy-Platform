import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RequestStatus, RequestType } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext } from "../../common/tenant/tenant-context";
import {
  REQUEST_EVENT_PUBLIC_SELECT,
  REQUEST_PUBLIC_SELECT,
  RequestsService,
} from "../requests/requests.service";
import { NotificationsService } from "../notifications/notifications.service";
import { isNoticeLanguageCode } from "../notices/languages";
import type { NotificationCallerActor } from "../notifications/guards/jwt-any-actor.guard";
import type { CreateMeRequestDto } from "./dto/create-me-request.dto";
import type { UpdateMeNominationDto } from "./dto/update-me-nomination.dto";

const NOMINATION_PUBLIC_SELECT = {
  id: true,
  nomineeName: true,
  nomineeEmail: true,
  nomineePhone: true,
  relationship: true,
  scope: true,
  activationCondition: true,
  particularsProvided: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NominationSelect;

const ME_REQUEST_EVENT_SELECT = {
  ...REQUEST_EVENT_PUBLIC_SELECT,
} satisfies Prisma.RequestEventSelect;

export interface PrincipalNoticeSummary {
  id: string;
  name: string;
  purposeStatements: Array<{
    purposeName: string;
    name: string;
    lawfulBasis: string;
    goodsOrServices?: string | null;
    description?: string | null;
  }>;
  versions: Array<{
    id: string;
    version: number;
    publishedAt: Date | null;
    languages: string[];
  }>;
}

export interface PrincipalNoticeView {
  id: string;
  noticeId: string;
  version: number;
  bodyMarkdown: string;
  languageCode: string;
  fallbackToEnglish: boolean;
  withdrawalUrl: string;
  rightsUrl: string;
  boardComplaintUrl: string;
  publishedAt: Date;
}

/** Self-service façades for resources whose employee services deliberately
 * expose organization-wide selectors. Every method taking a principal id
 * receives it from `JwtPrincipalGuard`; no request-supplied person selector
 * is accepted here. */
@Injectable()
export class MeRightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: RequestsService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async listRequests(dataPrincipalId: string) {
    return this.prisma.scoped.principalRequest.findMany({
      where: { dataPrincipalId },
      orderBy: [{ dueAt: "asc" }, { submittedAt: "asc" }],
      select: REQUEST_PUBLIC_SELECT,
    });
  }

  private async ownRequest(dataPrincipalId: string, reference: string) {
    const row = await this.prisma.scoped.principalRequest.findFirst({
      where: { dataPrincipalId, reference },
      select: REQUEST_PUBLIC_SELECT,
    });
    if (!row) throw new NotFoundException(`Request "${reference}" not found.`);
    return row;
  }

  async getRequest(dataPrincipalId: string, reference: string) {
    const row = await this.ownRequest(dataPrincipalId, reference);
    const events = await this.prisma.scoped.requestEvent.findMany({
      where: { requestId: row.id, visibleToPrincipal: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: ME_REQUEST_EVENT_SELECT,
    });
    return { ...row, events };
  }

  async createRequest(dataPrincipalId: string, dto: CreateMeRequestDto) {
    const subject = dto.subject.trim();
    const body = dto.body.trim();
    if (!subject || !body) {
      throw new BadRequestException("subject and body cannot be blank.");
    }
    return this.requestsService.create({
      dataPrincipalId,
      type: dto.type as RequestType,
      subject,
      body,
      requestedChanges: dto.requestedChanges,
      channel: "PORTAL",
    });
  }

  async cancelRequest(dataPrincipalId: string, reference: string) {
    const existing = await this.ownRequest(dataPrincipalId, reference);
    if (["COMPLETED", "REJECTED", "CANCELLED"].includes(existing.status)) {
      throw new ConflictException(`Request "${reference}" is already closed.`);
    }
    return this.requestsService.changeStatus(reference, {
      status: RequestStatus.CANCELLED,
      note: "Request cancelled by the Data Principal",
      visibleToPrincipal: true,
    });
  }

  async commentOnRequest(
    dataPrincipalId: string,
    reference: string,
    comment: string,
  ) {
    const trimmed = comment.trim();
    if (!trimmed) {
      throw new BadRequestException("comment cannot be blank.");
    }
    const existing = await this.ownRequest(dataPrincipalId, reference);
    if (["COMPLETED", "REJECTED", "CANCELLED"].includes(existing.status)) {
      throw new ConflictException(`Request "${reference}" is already closed.`);
    }
    return this.requestsService.addNote(reference, {
      note: trimmed,
      visibleToPrincipal: true,
    });
  }

  async listMessages(dataPrincipalId: string) {
    const actor: NotificationCallerActor = {
      audience: "PRINCIPAL",
      organizationId: TenantContext.get().organizationId,
      employeeId: null,
      dataPrincipalId,
    };
    const result = await this.notificationsService.list(actor);
    return result.items;
  }

  async getNomination(dataPrincipalId: string) {
    return this.prisma.scoped.nomination.findFirst({
      where: { dataPrincipalId, active: true },
      orderBy: { updatedAt: "desc" },
      select: NOMINATION_PUBLIC_SELECT,
    });
  }

  async upsertNomination(dataPrincipalId: string, dto: UpdateMeNominationDto) {
    const nomineeName = dto.nomineeName.trim();
    const relationship = dto.relationship.trim();
    if (!nomineeName || !relationship) {
      throw new BadRequestException(
        "nomineeName and relationship cannot be blank.",
      );
    }
    return this.prisma.scoped.$transaction(async (tx) => {
      const existing = await tx.nomination.findFirst({
        where: { dataPrincipalId, active: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      const data = {
        nomineeName,
        nomineeEmail: dto.nomineeEmail?.trim() || null,
        nomineePhone: dto.nomineePhone?.trim() || null,
        relationship,
        scope: dto.scope,
        activationCondition: dto.activationCondition,
      };
      const nomination = existing
        ? await tx.nomination.update({
            where: { id: existing.id },
            data,
            select: NOMINATION_PUBLIC_SELECT,
          })
        : await tx.nomination.create({
            data: {
              ...data,
              dataPrincipalId,
              particularsProvided: {} as Prisma.InputJsonValue,
            } as never,
            select: NOMINATION_PUBLIC_SELECT,
          });
      await this.auditService.record(tx, {
        action: "NOMINATION_UPDATED",
        resourceType: "Nomination",
        resourceId: nomination.id,
        subjectPrincipalId: dataPrincipalId,
        metadata: {
          change: existing ? "UPDATED" : "CREATED",
          scope: dto.scope,
        },
      });
      return nomination;
    });
  }

  async listPublishedNotices(): Promise<PrincipalNoticeSummary[]> {
    const notices = await this.prisma.scoped.privacyNotice.findMany({
      where: { status: "PUBLISHED", currentVersionId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        purposeIds: true,
        versions: {
          where: { publishedAt: { not: null }, retiredAt: null },
          orderBy: { version: "asc" },
          select: {
            id: true,
            version: true,
            publishedAt: true,
            translations: { select: { languageCode: true } },
          },
        },
      },
    });
    const purposeIds = [
      ...new Set(notices.flatMap((notice) => notice.purposeIds)),
    ];
    const purposes = purposeIds.length
      ? await this.prisma.scoped.processingPurpose.findMany({
          where: { id: { in: purposeIds } },
          select: {
            id: true,
            name: true,
            lawfulBasis: true,
            goodsOrServicesDescription: true,
          },
        })
      : [];
    const byId = new Map(purposes.map((purpose) => [purpose.id, purpose]));
    return notices.map((notice) => ({
      id: notice.id,
      name: notice.name,
      purposeStatements: notice.purposeIds.flatMap((purposeId) => {
        const purpose = byId.get(purposeId);
        return purpose
          ? [
              {
                purposeName: purpose.name,
                name: purpose.name,
                lawfulBasis: purpose.lawfulBasis,
                goodsOrServices: purpose.goodsOrServicesDescription,
                description: purpose.goodsOrServicesDescription,
              },
            ]
          : [];
      }),
      versions: notice.versions.map((version) => ({
        id: version.id,
        version: version.version,
        publishedAt: version.publishedAt,
        languages: [
          "en",
          ...version.translations.map(
            (translation) => translation.languageCode,
          ),
        ],
      })),
    }));
  }

  async getPublishedNotice(
    id: string,
    language = "en",
  ): Promise<PrincipalNoticeView> {
    if (!isNoticeLanguageCode(language)) {
      throw new BadRequestException("Unsupported notice language.");
    }
    const byVersion = await this.prisma.scoped.noticeVersion.findFirst({
      // A published version is only portal-visible while its notice shell is
      // published too.  Keep the direct version-id path subject to the same
      // tenant/status boundary as the notice-id fallback; otherwise a stale
      // version belonging to a notice returned to DRAFT could be read by
      // guessing its UUID.
      where: {
        id,
        publishedAt: { not: null },
        notice: { status: "PUBLISHED" },
      },
      select: {
        id: true,
        noticeId: true,
        version: true,
        bodyMarkdown: true,
        withdrawalUrl: true,
        rightsUrl: true,
        boardComplaintUrl: true,
        publishedAt: true,
        translations: {
          where: { languageCode: language },
          select: { bodyMarkdown: true, languageCode: true },
        },
      },
    });
    const version =
      byVersion ??
      (await this.prisma.scoped.noticeVersion.findFirst({
        where: {
          notice: { id, status: "PUBLISHED" },
          publishedAt: { not: null },
          retiredAt: null,
        },
        orderBy: { version: "desc" },
        select: {
          id: true,
          noticeId: true,
          version: true,
          bodyMarkdown: true,
          withdrawalUrl: true,
          rightsUrl: true,
          boardComplaintUrl: true,
          publishedAt: true,
          translations: {
            where: { languageCode: language },
            select: { bodyMarkdown: true, languageCode: true },
          },
        },
      }));
    if (!version || !version.publishedAt)
      throw new NotFoundException("Published notice not found.");
    const translation = version.translations[0];
    return {
      id: version.id,
      noticeId: version.noticeId,
      version: version.version,
      bodyMarkdown: translation?.bodyMarkdown ?? version.bodyMarkdown,
      languageCode: translation?.languageCode ?? "en",
      fallbackToEnglish: !translation && language !== "en",
      withdrawalUrl: version.withdrawalUrl,
      rightsUrl: version.rightsUrl,
      boardComplaintUrl: version.boardComplaintUrl,
      publishedAt: version.publishedAt,
    };
  }
}
