import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
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
export type AuditEventListItem = Omit<AuditEventListRow, "sequence"> & {
  sequence: string;
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

  async list(query: ListAuditEventsDto): Promise<AuditEventListResult> {
    const where = this.buildWhere(query);
    const offset = (query.page - 1) * AUDIT_EVENTS_PAGE_SIZE;

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
      items: items.map((item) => ({
        ...item,
        sequence: item.sequence.toString(),
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
