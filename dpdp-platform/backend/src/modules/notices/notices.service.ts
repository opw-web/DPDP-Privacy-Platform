import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { canonicalJson } from "../../common/audit/canonical-json";
import type { AccessTokenPayload } from "../auth/token.service";
import { CreateNoticeDto } from "./dto/create-notice.dto";
import { CreateNoticeVersionDto } from "./dto/create-notice-version.dto";
import { UpsertTranslationDto } from "./dto/upsert-translation.dto";
import { NOTICE_LANGUAGE_CODES, isNoticeLanguageCode } from "./languages";
import { humanizeCanonicalField, isItemisableCanonicalField } from "./canonical-field-label";

/**
 * The JSON shape stored in `NoticeVersion.itemisedDataFields` (Rule
 * 3(b)(i)). `canonicalField`, `dataCategory` and `label` are exactly the
 * spec's own comment on that column (`[{canonicalField, dataCategory,
 * label}]`); `sourceFieldMappingId` is a disclosed, deliberate addition
 * -- without it, re-opening a draft (creating version N+1 from version
 * N's content) could never show the admin which SourceFieldMapping rows
 * were already ticked, only their labels. Every consumer that reads this
 * JSON for its Rule 3(b)(i) content should ignore unknown keys rather
 * than assume a closed three-key shape.
 */
export interface ItemisedDataField {
  canonicalField: string;
  dataCategory: string;
  label: string;
  sourceFieldMappingId: string;
}

/**
 * The ONE JSON shape stored in `NoticeVersion.purposeStatements`, per the
 * spec's own comment on that column (Rule 3(b)(ii)).
 */
export interface PurposeStatement {
  purposeId: string;
  purposeName: string;
  goodsOrServices: string | null;
}

export const NOTICE_PUBLIC_SELECT = {
  id: true,
  code: true,
  name: true,
  purposeIds: true,
  status: true,
  currentVersionId: true,
  createdAt: true,
} satisfies Prisma.PrivacyNoticeSelect;

export type PublicNotice = Prisma.PrivacyNoticeGetPayload<{
  select: typeof NOTICE_PUBLIC_SELECT;
}>;

export const NOTICE_VERSION_PUBLIC_SELECT = {
  id: true,
  noticeId: true,
  version: true,
  itemisedDataFields: true,
  purposeStatements: true,
  withdrawalUrl: true,
  rightsUrl: true,
  boardComplaintUrl: true,
  bodyMarkdown: true,
  contentHash: true,
  publishedAt: true,
  retiredAt: true,
  createdByEmployeeId: true,
  approvedByEmployeeId: true,
} satisfies Prisma.NoticeVersionSelect;

export type PublicNoticeVersion = Prisma.NoticeVersionGetPayload<{
  select: typeof NOTICE_VERSION_PUBLIC_SELECT;
}>;

export const NOTICE_TRANSLATION_PUBLIC_SELECT = {
  id: true,
  noticeVersionId: true,
  languageCode: true,
  bodyMarkdown: true,
  translatedByEmployeeId: true,
} satisfies Prisma.NoticeTranslationSelect;

export type PublicNoticeTranslation = Prisma.NoticeTranslationGetPayload<{
  select: typeof NOTICE_TRANSLATION_PUBLIC_SELECT;
}>;

/**
 * Response shape of `GET /api/notices/:id`: the notice plus every version
 * (each with its translations), ordered oldest-first.
 */
export interface NoticeDetail extends PublicNotice {
  versions: (PublicNoticeVersion & { translations: PublicNoticeTranslation[] })[];
}

/**
 * The shape `CONSENT_REQUEST` campaigns (Wave 3) and any other consumer
 * need to enforce NT-01 ("notice precedes consent"): a campaign cannot be
 * created without a PUBLISHED `noticeVersionId`, and every `ConsentEvent`
 * needs both the version id and its frozen `contentHash` (CN-09 -- "what
 * she actually saw").
 */
export interface PublishedNoticeVersionLookup {
  noticeVersionId: string;
  version: number;
  contentHash: string;
  publishedAt: Date;
  bodyMarkdown: string;
}

/** One eligible-for-ticking itemised field row, before the admin picks it. */
export interface EligibleItemisedField {
  sourceFieldMappingId: string;
  dataSourceId: string;
  dataSourceName: string;
  sourceField: string;
  canonicalField: string;
  dataCategory: string;
  suggestedLabel: string;
}

export interface NoticeBodyPreview {
  languageCode: string;
  bodyMarkdown: string;
  isFallback: boolean;
  fallbackNote?: string;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function duplicateCodeMessage(code: string): string {
  return `A notice with code "${code}" already exists in this organization.`;
}

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicNotice[]> {
    return this.prisma.scoped.privacyNotice.findMany({
      orderBy: { createdAt: "asc" },
      select: NOTICE_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<NoticeDetail> {
    const notice = await this.prisma.scoped.privacyNotice.findFirst({
      where: { id },
      select: NOTICE_PUBLIC_SELECT,
    });
    if (!notice) {
      throw new NotFoundException(`Notice "${id}" not found.`);
    }

    const versions = await this.prisma.scoped.noticeVersion.findMany({
      where: { noticeId: id },
      orderBy: { version: "asc" },
      select: {
        ...NOTICE_VERSION_PUBLIC_SELECT,
        translations: { select: NOTICE_TRANSLATION_PUBLIC_SELECT },
      },
    });

    return { ...notice, versions };
  }

  async create(dto: CreateNoticeDto): Promise<PublicNotice> {
    const existing = await this.prisma.scoped.privacyNotice.findFirst({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(duplicateCodeMessage(dto.code));
    }

    // Pre-checked before the write -- same convention as
    // SourcePurposesService.replace(): a foreign/unknown purposeId is a
    // clean 400 the caller can act on, not a silently-ignored id that
    // makes this notice's purpose statements quietly incomplete forever.
    const knownPurposes = await this.prisma.scoped.processingPurpose.findMany({
      where: { id: { in: dto.purposeIds } },
      select: { id: true },
    });
    const knownIds = new Set(knownPurposes.map((p) => p.id));
    const unknown = dto.purposeIds.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown processing purpose id(s): ${unknown.join(", ")}`,
      );
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      let created: PublicNotice;
      try {
        created = await tx.privacyNotice.create({
          data: {
            code: dto.code,
            name: dto.name,
            purposeIds: dto.purposeIds,
            // organizationId deliberately omitted -- the tenant-scoping
            // extension supplies it at runtime (same convention as
            // EmployeesService.create / DataSourcesService.create /
            // RecipientsService.create).
          } as never,
          select: NOTICE_PUBLIC_SELECT,
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(duplicateCodeMessage(dto.code));
        }
        throw err;
      }

      // `AuditAction` (task 1's fixed union, this task may not extend it)
      // has no action for "a PrivacyNotice shell was created" -- only
      // NOTICE_PUBLISHED and NOTICE_VERSION_CREATED exist. Same reuse
      // pattern as SourcePurposesService (DATA_SOURCE_UPDATED +
      // `change` key) and TemplatesService before the Wave 1 integrator
      // added TEMPLATE_CREATED: reused here with a disambiguating
      // `change` key rather than inventing a new action name. Flagged in
      // the task report for the wave integrator -- a `NOTICE_CREATED`
      // action, mirroring `TEMPLATE_CREATED`, would be the clean fix.
      await this.auditService.record(tx, {
        action: "NOTICE_VERSION_CREATED",
        resourceType: "PrivacyNotice",
        resourceId: created.id,
        metadata: { change: "NOTICE_CREATED", code: created.code, purposeIds: created.purposeIds },
      });

      return created;
    });
  }

  /**
   * `GET /api/notices/:id/eligible-fields` -- not one of the four routes
   * the spec's endpoint table names, but required to make "the admin
   * ticks which itemised fields appear" (§4.2 step 1) function at all: it
   * lists every `SourceFieldMapping` row reachable from a `DataSource`
   * attached, via `DataSourcePurpose`, to one of this notice's purposes.
   * Gated by the same `CAN_MANAGE_NOTICES` permission as every other
   * route here -- no new permission added.
   */
  async listEligibleFields(noticeId: string): Promise<EligibleItemisedField[]> {
    const notice = await this.prisma.scoped.privacyNotice.findFirst({
      where: { id: noticeId },
      select: { purposeIds: true },
    });
    if (!notice) {
      throw new NotFoundException(`Notice "${noticeId}" not found.`);
    }
    if (notice.purposeIds.length === 0) {
      return [];
    }

    const links = await this.prisma.scoped.dataSourcePurpose.findMany({
      where: { purposeId: { in: notice.purposeIds } },
      select: { dataSourceId: true },
    });
    const dataSourceIds = [...new Set(links.map((l) => l.dataSourceId))];
    if (dataSourceIds.length === 0) {
      return [];
    }

    const mappings = await this.prisma.scoped.sourceFieldMapping.findMany({
      where: { dataSourceId: { in: dataSourceIds }, containsPersonalData: true },
      select: {
        id: true,
        dataSourceId: true,
        sourceField: true,
        canonicalField: true,
        dataCategory: true,
        dataSource: { select: { name: true } },
      },
      orderBy: [{ dataSourceId: "asc" }, { sourceField: "asc" }],
    });

    // A column with no canonical meaning cannot be itemised in a notice: it
    // would reach the reader as the literal word "Ignore". Offering it to the
    // DPO as a tickable field only invites that mistake.
    return mappings
      .filter((m) => isItemisableCanonicalField(m.canonicalField))
      .map((m) => ({
        sourceFieldMappingId: m.id,
        dataSourceId: m.dataSourceId,
        dataSourceName: m.dataSource.name,
        sourceField: m.sourceField,
        canonicalField: m.canonicalField,
        dataCategory: m.dataCategory,
        suggestedLabel: humanizeCanonicalField(m.canonicalField),
      }));
  }

  /**
   * Resolves the caller's ticked `sourceFieldMappingId`s into the stored
   * `itemisedDataFields` JSON shape, verifying each one belongs to a
   * `DataSource` attached (via `DataSourcePurpose`) to one of the
   * notice's purposes. This is the ONLY enforcement point for that check
   * -- there is no DTO decorator that can validate a foreign table.
   */
  private async resolveItemisedFields(
    notice: { purposeIds: string[] },
    requested: { sourceFieldMappingId: string; label?: string }[],
  ): Promise<ItemisedDataField[]> {
    if (requested.length === 0) {
      return [];
    }

    const mappingIds = [...new Set(requested.map((f) => f.sourceFieldMappingId))];
    const mappings = await this.prisma.scoped.sourceFieldMapping.findMany({
      where: { id: { in: mappingIds } },
      select: { id: true, dataSourceId: true, canonicalField: true, dataCategory: true },
    });
    const byId = new Map(mappings.map((m) => [m.id, m]));

    const unknown = mappingIds.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown SourceFieldMapping id(s): ${unknown.join(", ")}`,
      );
    }

    const dataSourceIds = [...new Set(mappings.map((m) => m.dataSourceId))];
    const links =
      notice.purposeIds.length === 0
        ? []
        : await this.prisma.scoped.dataSourcePurpose.findMany({
            where: {
              dataSourceId: { in: dataSourceIds },
              purposeId: { in: notice.purposeIds },
            },
            select: { dataSourceId: true },
          });
    const attached = new Set(links.map((l) => l.dataSourceId));

    const unattached = requested.filter((f) => {
      const mapping = byId.get(f.sourceFieldMappingId);
      return !mapping || !attached.has(mapping.dataSourceId);
    });
    if (unattached.length > 0) {
      throw new BadRequestException(
        "SourceFieldMapping id(s) not attached, via DataSourcePurpose, to " +
          "any purpose this notice covers: " +
          unattached.map((f) => f.sourceFieldMappingId).join(", "),
      );
    }

    return requested.map((f) => {
      const mapping = byId.get(f.sourceFieldMappingId)!;
      return {
        sourceFieldMappingId: f.sourceFieldMappingId,
        canonicalField: mapping.canonicalField,
        dataCategory: mapping.dataCategory,
        label:
          f.label && f.label.trim().length > 0
            ? f.label.trim()
            : humanizeCanonicalField(mapping.canonicalField),
      };
    });
  }

  private async snapshotPurposeStatements(
    purposeIds: string[],
  ): Promise<PurposeStatement[]> {
    if (purposeIds.length === 0) {
      return [];
    }
    const purposes = await this.prisma.scoped.processingPurpose.findMany({
      where: { id: { in: purposeIds } },
      select: { id: true, name: true, goodsOrServicesDescription: true },
    });
    const byId = new Map(purposes.map((p) => [p.id, p]));
    // Ordered to match notice.purposeIds, not Prisma's return order --
    // same discipline as SourcePurposesService.replace()'s orderedPurposes.
    return purposeIds
      .filter((id) => byId.has(id))
      .map((id) => {
        const p = byId.get(id)!;
        return { purposeId: p.id, purposeName: p.name, goodsOrServices: p.goodsOrServicesDescription };
      });
  }

  /**
   * `POST /api/notices/:id/versions`. Creates the next gap-free version
   * number for this notice. May be created as an incomplete draft (empty
   * itemised list, blank Rule 3(c) links) -- `publish()` is what enforces
   * completeness, not this method. `withdrawalUrl`/`rightsUrl`/
   * `boardComplaintUrl` are `NOT NULL` columns, so an omitted link is
   * stored as `""` (empty string), which `publish()` treats as missing.
   */
  async createVersion(
    noticeId: string,
    dto: CreateNoticeVersionDto,
    actor: AccessTokenPayload,
  ): Promise<PublicNoticeVersion> {
    const notice = await this.prisma.scoped.privacyNotice.findFirst({
      where: { id: noticeId },
      select: { id: true, purposeIds: true },
    });
    if (!notice) {
      throw new NotFoundException(`Notice "${noticeId}" not found.`);
    }

    const itemisedDataFields = await this.resolveItemisedFields(
      notice,
      dto.itemisedDataFields ?? [],
    );
    const purposeStatements = await this.snapshotPurposeStatements(notice.purposeIds);

    return this.prisma.scoped.$transaction(async (tx) => {
      const latest = await tx.noticeVersion.findFirst({
        where: { noticeId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;

      const created = await tx.noticeVersion.create({
        data: {
          noticeId,
          version,
          itemisedDataFields: itemisedDataFields as unknown as Prisma.InputJsonValue,
          purposeStatements: purposeStatements as unknown as Prisma.InputJsonValue,
          withdrawalUrl: dto.withdrawalUrl ?? "",
          rightsUrl: dto.rightsUrl ?? "",
          boardComplaintUrl: dto.boardComplaintUrl ?? "",
          bodyMarkdown: dto.bodyMarkdown,
          // Placeholder until publish() computes the real sha256 -- the
          // column is NOT NULL, and this draft has nothing to hash yet
          // (contentHash is defined as the hash of the PUBLISHED body).
          contentHash: "",
          createdByEmployeeId: actor.sub,
          // organizationId deliberately omitted -- tenant extension.
        } as never,
        select: NOTICE_VERSION_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "NOTICE_VERSION_CREATED",
        resourceType: "NoticeVersion",
        resourceId: created.id,
        metadata: { noticeId, version: created.version },
      });

      return created;
    });
  }

  private async getVersionOrThrow(
    noticeId: string,
    version: number,
  ): Promise<
    Prisma.NoticeVersionGetPayload<{
      select: typeof NOTICE_VERSION_PUBLIC_SELECT;
    }>
  > {
    const row = await this.prisma.scoped.noticeVersion.findFirst({
      where: { noticeId, version },
      select: NOTICE_VERSION_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(
        `Notice version ${version} not found for notice "${noticeId}".`,
      );
    }
    return row;
  }

  /**
   * `POST /api/notices/:id/versions/:v/publish`. The sole gate on Rule
   * 3(b)(i)/3(b)(ii)/3(c) completeness. On success: re-snapshots
   * `purposeStatements` from the LIVE `ProcessingPurpose` rows (so a
   * goods/services description filled in after the draft was created is
   * picked up), computes `contentHash` as sha256 of the canonical JSON of
   * everything the Data Principal will see, sets `publishedAt`, retires
   * any previously-published version of this notice, and points
   * `PrivacyNotice.currentVersionId` at this version. After this
   * transaction commits, the Wave 0 `notice_frozen` trigger refuses any
   * further change to `bodyMarkdown`/`contentHash` on this row.
   */
  async publish(
    noticeId: string,
    versionNumber: number,
    actor: AccessTokenPayload,
  ): Promise<PublicNoticeVersion> {
    const notice = await this.prisma.scoped.privacyNotice.findFirst({
      where: { id: noticeId },
      select: { id: true, purposeIds: true },
    });
    if (!notice) {
      throw new NotFoundException(`Notice "${noticeId}" not found.`);
    }

    const version = await this.getVersionOrThrow(noticeId, versionNumber);
    if (version.publishedAt) {
      throw new ConflictException(
        `Notice version ${versionNumber} of notice "${noticeId}" is already published.`,
      );
    }

    // Rule 3(b)(i): the itemised personal data list cannot be empty.
    const itemisedDataFields = Array.isArray(version.itemisedDataFields)
      ? (version.itemisedDataFields as unknown as ItemisedDataField[])
      : [];
    if (itemisedDataFields.length === 0) {
      throw new BadRequestException(
        "Cannot publish: the itemised personal data list is empty " +
          "(Rule 3(b)(i)). Tick at least one field before publishing.",
      );
    }

    // Rule 3(b)(ii): every selected purpose must carry a goods/services
    // description. Re-fetched live, not from the version's stored
    // snapshot, so a description added after the draft was created is
    // honoured.
    const purposes = await this.prisma.scoped.processingPurpose.findMany({
      where: { id: { in: notice.purposeIds } },
      select: { id: true, name: true, goodsOrServicesDescription: true },
    });
    const incomplete = purposes.filter(
      (p) => !p.goodsOrServicesDescription || p.goodsOrServicesDescription.trim().length === 0,
    );
    if (incomplete.length > 0) {
      throw new BadRequestException(
        "Cannot publish: the following purpose(s) are missing a goods/" +
          "services description (Rule 3(b)(ii)): " +
          incomplete.map((p) => p.name).join(", "),
      );
    }

    // Rule 3(c): all three links are mandatory.
    const missingLinks: string[] = [];
    if (!version.withdrawalUrl) missingLinks.push("withdrawalUrl");
    if (!version.rightsUrl) missingLinks.push("rightsUrl");
    if (!version.boardComplaintUrl) missingLinks.push("boardComplaintUrl");
    if (missingLinks.length > 0) {
      throw new BadRequestException(
        `Cannot publish: missing required Rule 3(c) link(s): ${missingLinks.join(", ")}.`,
      );
    }

    const byId = new Map(purposes.map((p) => [p.id, p]));
    const purposeStatements: PurposeStatement[] = notice.purposeIds
      .filter((id) => byId.has(id))
      .map((id) => {
        const p = byId.get(id)!;
        return { purposeId: p.id, purposeName: p.name, goodsOrServices: p.goodsOrServicesDescription };
      });

    const canonicalBody = canonicalJson({
      itemisedDataFields,
      purposeStatements,
      withdrawalUrl: version.withdrawalUrl,
      rightsUrl: version.rightsUrl,
      boardComplaintUrl: version.boardComplaintUrl,
      bodyMarkdown: version.bodyMarkdown,
    });
    const contentHash = createHash("sha256").update(canonicalBody).digest("hex");

    return this.prisma.scoped.$transaction(async (tx) => {
      const publishedAt = new Date();

      // Retire any other currently-published version of this notice --
      // only one version is ever "the" published one at a time.
      await tx.noticeVersion.updateMany({
        where: {
          noticeId,
          id: { not: version.id },
          publishedAt: { not: null },
          retiredAt: null,
        },
        data: { retiredAt: publishedAt },
      });

      const updated = await tx.noticeVersion.update({
        where: { id: version.id },
        data: {
          purposeStatements: purposeStatements as unknown as Prisma.InputJsonValue,
          contentHash,
          publishedAt,
          approvedByEmployeeId: actor.sub,
        },
        select: NOTICE_VERSION_PUBLIC_SELECT,
      });

      await tx.privacyNotice.update({
        where: { id: noticeId },
        data: { status: "PUBLISHED", currentVersionId: version.id },
      });

      await this.auditService.record(tx, {
        action: "NOTICE_PUBLISHED",
        resourceType: "NoticeVersion",
        resourceId: version.id,
        metadata: { noticeId, version: versionNumber, contentHash },
      });

      return updated;
    });
  }

  /**
   * `PUT /api/notices/:id/versions/:v/translations/:lang`. Stores a
   * human-authored translation verbatim -- no translation API is ever
   * called. `:lang` must be one of the 23 `NOTICE_LANGUAGE_CODES`.
   */
  async upsertTranslation(
    noticeId: string,
    versionNumber: number,
    languageCode: string,
    dto: UpsertTranslationDto,
    actor: AccessTokenPayload,
  ): Promise<PublicNoticeTranslation> {
    if (!isNoticeLanguageCode(languageCode)) {
      throw new BadRequestException(
        `Unknown language code "${languageCode}". Must be one of: ` +
          NOTICE_LANGUAGE_CODES.join(", "),
      );
    }

    const version = await this.getVersionOrThrow(noticeId, versionNumber);

    return this.prisma.scoped.$transaction(async (tx) => {
      const upserted = await tx.noticeTranslation.upsert({
        where: { noticeVersionId_languageCode: { noticeVersionId: version.id, languageCode } },
        create: {
          noticeVersionId: version.id,
          languageCode,
          bodyMarkdown: dto.bodyMarkdown,
          translatedByEmployeeId: actor.sub,
          // organizationId deliberately omitted -- tenant extension.
        } as never,
        update: {
          bodyMarkdown: dto.bodyMarkdown,
          translatedByEmployeeId: actor.sub,
        },
        select: NOTICE_TRANSLATION_PUBLIC_SELECT,
      });

      // Same fixed-`AuditAction`-union gap as `create()` above -- no
      // action exists for "a translation was stored/updated". Reused
      // with `resourceType: "NoticeTranslation"` as the disambiguator;
      // flagged in the task report for the wave integrator.
      await this.auditService.record(tx, {
        action: "NOTICE_VERSION_CREATED",
        resourceType: "NoticeTranslation",
        resourceId: upserted.id,
        metadata: { noticeId, version: versionNumber, languageCode },
      });

      return upserted;
    });
  }

  /**
   * `GET /api/notices/:id/versions/:v/preview[?lang=xx]` -- a standalone
   * render with nothing else, a literal check on Rule 3(a). Falls back to
   * the version's English `bodyMarkdown` with a visible note when the
   * requested language has no stored translation. `lang` omitted (or
   * "en") returns the version's own body directly.
   */
  async preview(
    noticeId: string,
    versionNumber: number,
    languageCode?: string,
  ): Promise<NoticeBodyPreview> {
    const version = await this.getVersionOrThrow(noticeId, versionNumber);
    const requested = languageCode ?? "en";

    if (!isNoticeLanguageCode(requested)) {
      throw new BadRequestException(
        `Unknown language code "${requested}". Must be one of: ` +
          NOTICE_LANGUAGE_CODES.join(", "),
      );
    }

    if (requested === "en") {
      return { languageCode: "en", bodyMarkdown: version.bodyMarkdown, isFallback: false };
    }

    const translation = await this.prisma.scoped.noticeTranslation.findFirst({
      where: { noticeVersionId: version.id, languageCode: requested },
      select: { bodyMarkdown: true },
    });

    if (translation) {
      return { languageCode: requested, bodyMarkdown: translation.bodyMarkdown, isFallback: false };
    }

    return {
      languageCode: "en",
      bodyMarkdown: version.bodyMarkdown,
      isFallback: true,
      fallbackNote: `No "${requested}" translation is available yet -- showing the English original.`,
    };
  }

  /**
   * The lookup a `CONSENT_REQUEST` campaign (and any other consumer) uses
   * to enforce NT-01: a campaign cannot be created without a PUBLISHED
   * `noticeVersionId`. Returns `null` when the notice has no currently
   * published version (draft-only, or every version retired).
   */
  async getPublishedVersion(
    noticeId: string,
  ): Promise<PublishedNoticeVersionLookup | null> {
    const notice = await this.prisma.scoped.privacyNotice.findFirst({
      where: { id: noticeId },
      select: { status: true, currentVersionId: true },
    });
    if (!notice || notice.status !== "PUBLISHED" || !notice.currentVersionId) {
      return null;
    }

    const version = await this.prisma.scoped.noticeVersion.findFirst({
      where: { id: notice.currentVersionId, publishedAt: { not: null }, retiredAt: null },
      select: { id: true, version: true, contentHash: true, publishedAt: true, bodyMarkdown: true },
    });
    if (!version || !version.publishedAt) {
      return null;
    }

    return {
      noticeVersionId: version.id,
      version: version.version,
      contentHash: version.contentHash,
      publishedAt: version.publishedAt,
      bodyMarkdown: version.bodyMarkdown,
    };
  }
}
