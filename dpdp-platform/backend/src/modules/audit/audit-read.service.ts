import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import { MaskingService } from "../../common/masking/masking.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { csvDocument } from "../inventory/csv-writer";
import type { AccessLogExportDto } from "./dto/access-log-export.dto";
import {
  AUDIT_EVENTS_PAGE_SIZE,
  type ListAuditEventsDto,
} from "./dto/list-audit-events.dto";

const AUDIT_EVENT_LIST_SELECT = {
  id: true,
  sequence: true,
  actorType: true,
  actorId: true,
  actorLabel: true,
  action: true,
  resourceType: true,
  resourceId: true,
  subjectPrincipalId: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
} satisfies Prisma.AuditEventSelect;

type AuditEventListRow = Prisma.AuditEventGetPayload<{
  select: typeof AUDIT_EVENT_LIST_SELECT;
}>;

/**
 * The wire shape of one list row. `sequence` is a per-org monotonic
 * `BigInt` column (see `prisma/schema.prisma`) -- `JSON.stringify` cannot
 * serialize a `bigint` at all, and a plain `number` would silently lose
 * precision once the per-org sequence passes 2^53. It is therefore
 * serialized as a decimal string, converted here at the DTO boundary
 * rather than by mutating `BigInt.prototype` globally.
 */
/**
 * `metadata` is omitted from the wire type entirely (rather than typed
 * `Prisma.JsonValue | undefined`, which would still say "present, but
 * maybe empty") because `list()` deletes the key outright for an actor
 * without `CAN_VIEW_ALL_PERSONAL_DATA` -- see the masking note there.
 */
export type AuditEventListItem = Omit<
  AuditEventListRow,
  "sequence" | "metadata"
> & {
  sequence: string;
  metadata?: Prisma.JsonValue;
};

export interface AuditEventListResult {
  items: AuditEventListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

const ACCESS_LOG_CSV_HEADER: readonly string[] = [
  "Event ID",
  "Sequence",
  "Occurred At",
  "Actor Type",
  "Actor ID",
  "Actor Label",
  "Subject Principal ID",
  "Resource Type",
  "Resource ID",
];

/**
 * `GET /api/audit-events` and `GET /api/audit-events/access-log.csv`
 * (spec lines 833-834). READ-ONLY: neither method here writes an
 * `AuditEvent` for the plain list -- only the CSV export does, because
 * exporting is itself an evidence-producing action (`EVIDENCE_EXPORTED`),
 * viewing a page of the log is not. There is no write path anywhere in
 * this module; `AuditService.record` remains the only writer in the
 * codebase.
 */
@Injectable()
export class AuditReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly maskingService: MaskingService,
  ) {}

  private buildWhere(filters: {
    action?: string;
    actorId?: string;
    resourceType?: string;
    resourceId?: string;
    subjectPrincipalId?: string;
    from?: string;
    to?: string;
  }): Prisma.AuditEventWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) {
      createdAt.gte = new Date(filters.from);
    }
    if (filters.to) {
      createdAt.lte = new Date(filters.to);
    }
    return {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
      ...(filters.resourceId ? { resourceId: filters.resourceId } : {}),
      ...(filters.subjectPrincipalId
        ? { subjectPrincipalId: filters.subjectPrincipalId }
        : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };
  }

  /**
   * I-1 (final whole-branch review): `AuditEvent.metadata` is free-form
   * JSON and routinely carries personal-data values written by other
   * modules (e.g. `PRINCIPAL_CREATED`'s `displayName`,
   * `linking.service.ts`). `CAN_VIEW_AUDIT_LOG` alone -- the only
   * permission this route requires -- must not double as a masking
   * bypass for the AUDITOR role, which deliberately holds
   * `CAN_VIEW_AUDIT_LOG` without `CAN_VIEW_ALL_PERSONAL_DATA`.
   *
   * The stored row itself is never touched -- `AuditService.record()`
   * remains the only writer and the table stays append-only and complete
   * for chain verification. This gates the *read*: `metadata` is dropped
   * from the response entirely (not redacted field-by-field) for an
   * actor lacking `CAN_VIEW_ALL_PERSONAL_DATA`, reusing the same
   * permission gate `MaskingService` already enforces everywhere else
   * (`hasFullPersonalDataAccess`) rather than a second, ad hoc check.
   * Metadata is not keyed by `CanonicalField`, so `maskValue`'s per-field
   * masking does not apply here -- omitting the field is the smaller,
   * correct fix the review calls out, and loses nothing an auditor needs
   * from this list endpoint.
   */
  async list(
    query: ListAuditEventsDto,
    actorPermissions: ReadonlySet<string>,
  ): Promise<AuditEventListResult> {
    const where = this.buildWhere(query);
    const offset = (query.page - 1) * AUDIT_EVENTS_PAGE_SIZE;
    const canViewMetadata =
      this.maskingService.hasFullPersonalDataAccess(actorPermissions);

    const [items, totalCount] = await Promise.all([
      this.prisma.scoped.auditEvent.findMany({
        where,
        orderBy: { sequence: "desc" },
        skip: offset,
        take: AUDIT_EVENTS_PAGE_SIZE,
        select: AUDIT_EVENT_LIST_SELECT,
      }),
      this.prisma.scoped.auditEvent.count({ where }),
    ]);

    return {
      items: items.map(({ metadata, ...item }) => ({
        ...item,
        sequence: item.sequence.toString(),
        ...(canViewMetadata ? { metadata } : {}),
      })),
      page: query.page,
      pageSize: AUDIT_EVENTS_PAGE_SIZE,
      totalCount,
    };
  }

  async accessLogCsv(query: AccessLogExportDto): Promise<string> {
    const where: Prisma.AuditEventWhereInput = {
      action: "PERSONAL_DATA_VIEWED",
      ...(query.subjectPrincipalId
        ? { subjectPrincipalId: query.subjectPrincipalId }
        : {}),
    };

    const events = await this.prisma.scoped.auditEvent.findMany({
      where,
      orderBy: { sequence: "desc" },
      select: {
        id: true,
        sequence: true,
        actorType: true,
        actorId: true,
        actorLabel: true,
        subjectPrincipalId: true,
        resourceType: true,
        resourceId: true,
        createdAt: true,
      },
    });

    const rows = events.map((event) => [
      event.id,
      event.sequence.toString(),
      event.createdAt.toISOString(),
      event.actorType,
      event.actorId ?? "",
      event.actorLabel,
      event.subjectPrincipalId ?? "",
      event.resourceType,
      event.resourceId ?? "",
    ]);
    const csv = csvDocument(ACCESS_LOG_CSV_HEADER, rows);

    await this.prisma.scoped.$transaction(async (tx) => {
      await this.auditService.record(tx, {
        action: "EVIDENCE_EXPORTED",
        resourceType: "AccessLog",
        subjectPrincipalId: query.subjectPrincipalId,
        metadata: {
          exportType: "ACCESS_LOG",
          rowCount: rows.length,
          ...(query.subjectPrincipalId
            ? { subjectPrincipalId: query.subjectPrincipalId }
            : {}),
        },
      });
    });

    return csv;
  }
}
