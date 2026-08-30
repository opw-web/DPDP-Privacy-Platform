import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CandidateStatus, CanonicalField } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import type { AccessTokenPayload } from "../auth/token.service";
import { MergeService } from "./merge.service";

/** The status a caller gets when `?status=` is omitted entirely. */
const DEFAULT_LIST_STATUS: CandidateStatus = "PENDING";

/**
 * The canonical fields the review queue compares side by side. Chosen to
 * mirror exactly the signals the deterministic matcher itself uses
 * (rules 1-3's identifiers, rule 4's supporting signals), plus FULL_NAME
 * so a reviewer has a name to look at without opening the raw record.
 */
const SIGNAL_FIELDS: readonly CanonicalField[] = [
  "FULL_NAME",
  "EMAIL",
  "PHONE",
  "CUSTOMER_ID",
  "POSTAL_CODE",
  "DATE_OF_BIRTH",
];

export type SignalAgreement = "AGREE" | "CONFLICT" | "INSUFFICIENT_DATA";

export interface CandidateSignal {
  canonicalField: CanonicalField;
  recordValue: string | null;
  /** All distinct values the principal's assembled profile holds for this field (comma-joined, sorted) -- more than one exactly when that field is already itself in `conflict`. */
  principalValue: string | null;
  agreement: SignalAgreement;
}

/**
 * The shape `GET /api/match-candidates` returns and Task 26's review
 * queue consumes UNCHANGED (task brief). Record and principal are two
 * separate, parallel blocks so the UI can render them side by side; every
 * value in `signals` is display-only, derived at read time from the
 * record's own fields and the principal's current `PrincipalDataField`
 * rows -- there is no persisted "agreement" column to drift out of date.
 */
export interface MatchCandidateListItem {
  id: string;
  status: CandidateStatus;
  confidence: string;
  score: number;
  evidence: Record<string, unknown>;
  createdAt: Date;
  decidedByEmployeeId: string | null;
  decidedAt: Date | null;
  record: {
    normalizedRecordId: string;
    sourceRecordId: string;
    dataSourceId: string;
    fullName: string | null;
    emailNormalized: string | null;
    phoneNormalized: string | null;
    customerId: string | null;
    postalCode: string | null;
    dateOfBirth: string | null;
  };
  principal: {
    dataPrincipalId: string;
    reference: string;
    displayName: string;
  };
  signals: CandidateSignal[];
}

type CandidateNormalizedRecord = {
  id: string;
  sourceRecordId: string;
  fullName: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  customerId: string | null;
  postalCode: string | null;
  dateOfBirth: Date | null;
};

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function recordValueFor(
  field: CanonicalField,
  record: CandidateNormalizedRecord,
): string | null {
  switch (field) {
    case "FULL_NAME":
      return record.fullName;
    case "EMAIL":
      return record.emailNormalized;
    case "PHONE":
      return record.phoneNormalized;
    case "CUSTOMER_ID":
      return record.customerId;
    case "POSTAL_CODE":
      return record.postalCode;
    case "DATE_OF_BIRTH":
      return isoDate(record.dateOfBirth);
    default:
      return null;
  }
}

/**
 * `/api/match-candidates` (spec lines 828-829): list the review queue and
 * decide (confirm/reject) one candidate. Confirming re-parents the link
 * via `MergeService`; rejecting only flips the candidate's own status --
 * the schema's `(normalizedRecordId, dataPrincipalId)` unique constraint
 * plus `LinkingService.createCandidate`'s unconditional (status-blind)
 * pre-check are what already stop a rejected pair from being re-raised.
 */
@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mergeService: MergeService,
  ) {}

  async list(status?: CandidateStatus): Promise<MatchCandidateListItem[]> {
    const effectiveStatus = status ?? DEFAULT_LIST_STATUS;
    const candidates = await this.prisma.scoped.matchCandidate.findMany({
      where: { status: effectiveStatus },
      orderBy: { createdAt: "asc" },
    });
    if (candidates.length === 0) {
      return [];
    }

    const normalizedRecordIds = [
      ...new Set(candidates.map((candidate) => candidate.normalizedRecordId)),
    ];
    const dataPrincipalIds = [
      ...new Set(candidates.map((candidate) => candidate.dataPrincipalId)),
    ];

    const [records, principals, fields] = await Promise.all([
      this.prisma.scoped.normalizedRecord.findMany({
        where: { id: { in: normalizedRecordIds } },
        select: {
          id: true,
          sourceRecordId: true,
          fullName: true,
          emailNormalized: true,
          phoneNormalized: true,
          customerId: true,
          postalCode: true,
          dateOfBirth: true,
        },
      }),
      this.prisma.scoped.dataPrincipal.findMany({
        where: { id: { in: dataPrincipalIds } },
        select: { id: true, reference: true, displayName: true },
      }),
      this.prisma.scoped.principalDataField.findMany({
        where: {
          dataPrincipalId: { in: dataPrincipalIds },
          canonicalField: { in: [...SIGNAL_FIELDS] },
        },
        select: { dataPrincipalId: true, canonicalField: true, value: true },
      }),
    ]);

    const sourceRecordIds = [
      ...new Set(records.map((record) => record.sourceRecordId)),
    ];
    const sourceRecords =
      sourceRecordIds.length === 0
        ? []
        : await this.prisma.scoped.sourceRecord.findMany({
            where: { id: { in: sourceRecordIds } },
            select: { id: true, dataSourceId: true },
          });

    const recordById = new Map(records.map((record) => [record.id, record]));
    const sourceById = new Map(
      sourceRecords.map((source) => [source.id, source]),
    );
    const principalById = new Map(
      principals.map((principal) => [principal.id, principal]),
    );
    const fieldsByPrincipal = new Map<
      string,
      Map<CanonicalField, Set<string>>
    >();
    for (const field of fields) {
      const byField =
        fieldsByPrincipal.get(field.dataPrincipalId) ??
        new Map<CanonicalField, Set<string>>();
      const values = byField.get(field.canonicalField) ?? new Set<string>();
      values.add(field.value);
      byField.set(field.canonicalField, values);
      fieldsByPrincipal.set(field.dataPrincipalId, byField);
    }

    const items: MatchCandidateListItem[] = [];
    for (const candidate of candidates) {
      const record = recordById.get(candidate.normalizedRecordId);
      const principal = principalById.get(candidate.dataPrincipalId);
      const source = record ? sourceById.get(record.sourceRecordId) : undefined;
      // Defensive only: tenant scoping plus FK integrity make a missing
      // record/principal/source unreachable in practice. Never emit a
      // half-populated row if it somehow happened.
      if (!record || !principal || !source) {
        continue;
      }

      const principalFieldValues =
        fieldsByPrincipal.get(candidate.dataPrincipalId) ??
        new Map<CanonicalField, Set<string>>();
      const signals: CandidateSignal[] = SIGNAL_FIELDS.map((field) => {
        const recordValue = recordValueFor(field, record);
        const principalValues = principalFieldValues.get(field);
        let agreement: SignalAgreement;
        if (
          recordValue === null ||
          !principalValues ||
          principalValues.size === 0
        ) {
          agreement = "INSUFFICIENT_DATA";
        } else if (principalValues.has(recordValue)) {
          agreement = "AGREE";
        } else {
          agreement = "CONFLICT";
        }
        return {
          canonicalField: field,
          recordValue,
          principalValue: principalValues
            ? [...principalValues].sort().join(", ")
            : null,
          agreement,
        };
      });

      items.push({
        id: candidate.id,
        status: candidate.status,
        confidence: candidate.confidence,
        score: candidate.score,
        evidence: candidate.evidence as Record<string, unknown>,
        createdAt: candidate.createdAt,
        decidedByEmployeeId: candidate.decidedByEmployeeId,
        decidedAt: candidate.decidedAt,
        record: {
          normalizedRecordId: record.id,
          sourceRecordId: record.sourceRecordId,
          dataSourceId: source.dataSourceId,
          fullName: record.fullName,
          emailNormalized: record.emailNormalized,
          phoneNormalized: record.phoneNormalized,
          customerId: record.customerId,
          postalCode: record.postalCode,
          dateOfBirth: isoDate(record.dateOfBirth),
        },
        principal: {
          dataPrincipalId: principal.id,
          reference: principal.reference,
          displayName: principal.displayName,
        },
        signals,
      });
    }
    return items;
  }

  private async loadPendingCandidate(tx: ScopedTransactionClient, id: string) {
    const candidate = await tx.matchCandidate.findFirst({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`Match candidate "${id}" not found.`);
    }
    if (candidate.status !== "PENDING") {
      throw new BadRequestException(
        `Match candidate "${id}" has already been decided (${candidate.status}).`,
      );
    }
    return candidate;
  }

  async confirm(
    id: string,
    actor: AccessTokenPayload,
  ): Promise<{
    id: string;
    status: CandidateStatus;
    identityLinkId: string;
    dataPrincipalId: string;
  }> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const candidate = await this.loadPendingCandidate(tx, id);

      const mergeResult = await this.mergeService.mergeRecordIntoPrincipal(
        tx,
        candidate.normalizedRecordId,
        candidate.dataPrincipalId,
        {
          confidence: candidate.confidence,
          linkedByEmployeeId: actor.sub,
          matchedOn: {
            rule: "MANUAL_CANDIDATE_CONFIRM",
            candidateId: candidate.id,
          },
        },
      );

      const updated = await tx.matchCandidate.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          decidedByEmployeeId: actor.sub,
          decidedAt: new Date(),
        },
      });

      await this.auditService.record(tx, {
        action: "MATCH_CANDIDATE_CONFIRMED",
        resourceType: "MatchCandidate",
        resourceId: id,
        subjectPrincipalId: candidate.dataPrincipalId,
        metadata: {
          normalizedRecordId: candidate.normalizedRecordId,
          dataPrincipalId: candidate.dataPrincipalId,
          identityLinkId: mergeResult.identityLinkId,
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        identityLinkId: mergeResult.identityLinkId,
        dataPrincipalId: mergeResult.dataPrincipalId,
      };
    });
  }

  async reject(
    id: string,
    actor: AccessTokenPayload,
  ): Promise<{ id: string; status: CandidateStatus }> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const candidate = await this.loadPendingCandidate(tx, id);

      const updated = await tx.matchCandidate.update({
        where: { id },
        data: {
          status: "REJECTED",
          decidedByEmployeeId: actor.sub,
          decidedAt: new Date(),
        },
      });

      await this.auditService.record(tx, {
        action: "MATCH_CANDIDATE_REJECTED",
        resourceType: "MatchCandidate",
        resourceId: id,
        subjectPrincipalId: candidate.dataPrincipalId,
        metadata: {
          normalizedRecordId: candidate.normalizedRecordId,
          dataPrincipalId: candidate.dataPrincipalId,
        },
      });

      return { id: updated.id, status: updated.status };
    });
  }
}
