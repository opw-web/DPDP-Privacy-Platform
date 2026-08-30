import { Injectable } from "@nestjs/common";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { csvDocument } from "./csv-writer";

/**
 * The RoPA CSV's header row, in column order. Spec Check 21: "one row per
 * purpose, with lawful basis, s.7 limb where relevant, data categories,
 * source systems, recipients, cross-border destinations, retention
 * policy and review status." Kept as one named constant so the header a
 * test asserts against and the header actually written can never drift
 * apart.
 */
export const ROPA_CSV_HEADER: readonly string[] = [
  "Purpose Code",
  "Purpose Name",
  "Lawful Basis",
  "Section 7 Limb",
  "Data Categories",
  "Source Systems",
  "Recipients",
  "Cross-Border Destinations",
  "Retention Policy",
  "Review Status",
];

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * Builds the Record of Processing Activities export (EV-02).
 *
 * Ruling (task brief, spec Check 21): a purpose with an unpopulated
 * register column -- no sources attached, no sharing activity, no
 * cross-border transfer, no retention policy -- still emits its row,
 * with that column BLANK. Nothing here filters a purpose out for having
 * an empty register; "hidden" would be the failure, not "blank".
 *
 * Every purpose is included regardless of `active`, for the same reason
 * `InventoryService`'s gap counts do not filter by `active`: a register
 * finding is not something an `active` flag gets to hide.
 */
@Injectable()
export class RopaExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async exportCsv(): Promise<string> {
    const purposes = await this.prisma.scoped.processingPurpose.findMany({
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        lawfulBasis: true,
        legitimateUseLimb: true,
        dataCategories: true,
        reviewedAt: true,
      },
    });
    const purposeIds = purposes.map((purpose) => purpose.id);

    const [dataSourcePurposes, sharingActivities, retentionPolicies] =
      purposeIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            this.prisma.scoped.dataSourcePurpose.findMany({
              where: { purposeId: { in: purposeIds } },
              select: {
                purposeId: true,
                dataSource: { select: { name: true } },
              },
            }),
            this.prisma.scoped.sharingActivity.findMany({
              where: { purposeId: { in: purposeIds } },
              select: {
                purposeId: true,
                recipientId: true,
                recipient: { select: { name: true } },
              },
            }),
            this.prisma.scoped.retentionPolicy.findMany({
              where: { purposeId: { in: purposeIds } },
              select: {
                purposeId: true,
                name: true,
                retentionValue: true,
                retentionUnit: true,
                legalBasisForRetention: true,
              },
            }),
          ]);

    const recipientIds = sortedUnique(
      sharingActivities.map((activity) => activity.recipientId),
    );
    const crossBorderTransfers = recipientIds.length
      ? await this.prisma.scoped.crossBorderTransfer.findMany({
          where: { recipientId: { in: recipientIds } },
          select: { recipientId: true, destinationCountry: true },
        })
      : [];

    const sourceNamesByPurpose = new Map<string, string[]>();
    for (const row of dataSourcePurposes) {
      const existing = sourceNamesByPurpose.get(row.purposeId) ?? [];
      existing.push(row.dataSource.name);
      sourceNamesByPurpose.set(row.purposeId, existing);
    }

    const recipientNamesByPurpose = new Map<string, string[]>();
    const recipientIdsByPurpose = new Map<string, string[]>();
    for (const row of sharingActivities) {
      const names = recipientNamesByPurpose.get(row.purposeId) ?? [];
      names.push(row.recipient.name);
      recipientNamesByPurpose.set(row.purposeId, names);
      const ids = recipientIdsByPurpose.get(row.purposeId) ?? [];
      ids.push(row.recipientId);
      recipientIdsByPurpose.set(row.purposeId, ids);
    }

    const destinationsByRecipient = new Map<string, string[]>();
    for (const transfer of crossBorderTransfers) {
      const existing = destinationsByRecipient.get(transfer.recipientId) ?? [];
      existing.push(transfer.destinationCountry);
      destinationsByRecipient.set(transfer.recipientId, existing);
    }

    const retentionStringsByPurpose = new Map<string, string[]>();
    for (const policy of retentionPolicies) {
      const existing = retentionStringsByPurpose.get(policy.purposeId) ?? [];
      existing.push(
        `${policy.name}: ${policy.retentionValue} ${policy.retentionUnit} ` +
          `(${policy.legalBasisForRetention})`,
      );
      retentionStringsByPurpose.set(policy.purposeId, existing);
    }

    const rows = purposes.map((purpose) => {
      const sourceNames = sortedUnique(
        sourceNamesByPurpose.get(purpose.id) ?? [],
      );
      const recipientNames = sortedUnique(
        recipientNamesByPurpose.get(purpose.id) ?? [],
      );
      const recipientIdsForPurpose =
        recipientIdsByPurpose.get(purpose.id) ?? [];
      const crossBorderDestinations = sortedUnique(
        recipientIdsForPurpose.flatMap(
          (recipientId) => destinationsByRecipient.get(recipientId) ?? [],
        ),
      );
      const retentionStrings = sortedUnique(
        retentionStringsByPurpose.get(purpose.id) ?? [],
      );

      return [
        purpose.code,
        purpose.name,
        purpose.lawfulBasis,
        purpose.legitimateUseLimb ?? "",
        sortedUnique(purpose.dataCategories).join("; "),
        sourceNames.join("; "),
        recipientNames.join("; "),
        crossBorderDestinations.join("; "),
        retentionStrings.join("; "),
        purpose.reviewedAt ? "REVIEWED" : "UNREVIEWED",
      ];
    });

    const csv = csvDocument(ROPA_CSV_HEADER, rows);

    await this.prisma.scoped.$transaction(async (tx) => {
      await this.auditService.record(tx, {
        action: "EVIDENCE_EXPORTED",
        resourceType: "RoPA",
        metadata: { exportType: "ROPA", rowCount: rows.length },
      });
    });

    return csv;
  }
}
