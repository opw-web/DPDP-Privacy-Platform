import { Injectable } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { csvDocument } from "../inventory/csv-writer";

export const AUDIT_LOG_CSV_HEADER: readonly string[] = [
  "Sequence",
  "Occurred At",
  "Actor Type",
  "Actor ID",
  "Actor Label",
  "Action",
  "Resource Type",
  "Resource ID",
  "Subject Principal ID",
  "Previous Hash",
  "Hash",
  "Metadata",
];

/**
 * EV-12: "Immutable audit log with verifiable hash chain, exportable to
 * CSV." Distinct from `AuditReadModule`'s
 * `GET /api/audit-events/access-log.csv` (EV-08, `action =
 * PERSONAL_DATA_VIEWED` only) -- this exports the FULL chain, every
 * action, with the hash-chain columns included so the CSV itself can be
 * independently re-verified outside this application (recompute
 * `sha256(previousHash + sequence + action + resourceId +
 * canonicalJson(metadata) + createdAt)` per row from the exported
 * columns and compare to `Hash`).
 */
@Injectable()
export class AuditExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async exportCsv(): Promise<string> {
    const events = await this.prisma.scoped.auditEvent.findMany({
      orderBy: { sequence: "asc" },
      select: {
        sequence: true,
        actorType: true,
        actorId: true,
        actorLabel: true,
        action: true,
        resourceType: true,
        resourceId: true,
        subjectPrincipalId: true,
        previousHash: true,
        hash: true,
        metadata: true,
        createdAt: true,
      },
    });

    const rows = events.map((event) => [
      event.sequence.toString(),
      event.createdAt.toISOString(),
      event.actorType,
      event.actorId ?? "",
      event.actorLabel,
      event.action,
      event.resourceType,
      event.resourceId ?? "",
      event.subjectPrincipalId ?? "",
      event.previousHash ?? "",
      event.hash,
      JSON.stringify(event.metadata ?? {}),
    ]);
    const csv = csvDocument(AUDIT_LOG_CSV_HEADER, rows);

    await this.prisma.scoped.$transaction(async (tx) => {
      await this.auditService.record(tx, {
        action: "EVIDENCE_EXPORTED",
        resourceType: "AuditLog",
        metadata: { exportType: "AUDIT_LOG", rowCount: rows.length },
      });
    });

    return csv;
  }
}
