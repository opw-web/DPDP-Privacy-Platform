import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { ReferenceService } from "../../common/reference/reference.service";
import type { NormalizationMapping } from "../normalization/normalization.service";
import type { MatchResult, RaisedCandidate } from "./matching.service";

export type LinkableNormalizedRecord = {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  customerId: string | null;
};

export interface ApplyMatchResult {
  dataPrincipalId: string | null;
  linkCreated: boolean;
  candidatesCreated: number;
}

class IdentifierOwnershipConflictError extends Error {
  constructor(type: string, value: string) {
    super(
      `Cannot attach ${type} identifier "${value}": it already belongs to a different data principal.`,
    );
    this.name = "IdentifierOwnershipConflictError";
  }
}

function displayName(record: LinkableNormalizedRecord): string {
  if (record.fullName) {
    return record.fullName;
  }
  const name = [record.firstName, record.lastName].filter(Boolean).join(" ");
  return name || "Unnamed principal";
}

function verifiedCustomerId(
  record: LinkableNormalizedRecord,
  mappings: readonly NormalizationMapping[],
): string | null {
  return record.customerId &&
    mappings.some(
      (mapping) =>
        mapping.canonicalField === "CUSTOMER_ID" &&
        mapping.isVerifiedCustomerId === true,
    )
    ? record.customerId
    : null;
}

/**
 * Applies a deterministic result inside the caller's interactive transaction.
 * It never updates NormalizedRecord/SourceRecord: matching may only add the
 * principal-side rows which describe the resolution.
 */
@Injectable()
export class LinkingService {
  constructor(
    private readonly referenceService: ReferenceService,
    private readonly auditService: AuditService,
  ) {}

  private async createCandidate(
    tx: ScopedTransactionClient,
    normalizedRecordId: string,
    candidate: RaisedCandidate,
  ): Promise<boolean> {
    const existing = await tx.matchCandidate.findFirst({
      where: {
        normalizedRecordId,
        dataPrincipalId: candidate.dataPrincipalId,
      },
      select: { id: true },
    });
    if (existing) {
      return false;
    }

    // Do not catch P2002 here. A concurrent insert makes this interactive
    // transaction unsafe to continue; failing lets the caller retry, at which
    // point the pre-read above returns the existing candidate. In particular,
    // we never reinterpret a uniqueness race as permission to merge people.
    const created = await tx.matchCandidate.create({
      data: {
        normalizedRecordId,
        dataPrincipalId: candidate.dataPrincipalId,
        confidence: candidate.confidence,
        score: candidate.score,
        evidence: candidate.evidence as Prisma.InputJsonValue,
      } as never,
      select: { id: true },
    });
    await this.auditService.record(tx, {
      action: "MATCH_CANDIDATE_CREATED",
      resourceType: "MatchCandidate",
      resourceId: created.id,
      subjectPrincipalId: candidate.dataPrincipalId,
      metadata: {
        normalizedRecordId,
        dataPrincipalId: candidate.dataPrincipalId,
        confidence: candidate.confidence,
        score: candidate.score,
      },
    });
    return true;
  }

  private async attachIdentifier(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
    type: "CUSTOMER_ID" | "EMAIL" | "PHONE",
    value: string | null,
    knownConflictingPrincipalIds: ReadonlySet<string>,
  ): Promise<void> {
    if (!value) {
      return;
    }
    const existing = await tx.principalIdentifier.findFirst({
      where: { type, value },
      select: { dataPrincipalId: true },
    });
    if (existing) {
      if (existing.dataPrincipalId !== dataPrincipalId) {
        // Matching has already preserved this exact conflicting signal as a
        // pending candidate. Leave the identifier with its real owner: moving
        // it would steal an identity, while throwing would make the mandated
        // exact-vs-high conflict flow unusable. Any ownership surprise that
        // was NOT represented in MatchResult still fails the transaction.
        if (knownConflictingPrincipalIds.has(existing.dataPrincipalId)) {
          return;
        }
        throw new IdentifierOwnershipConflictError(type, value);
      }
      return;
    }

    // As with active-link/candidate uniqueness, a P2002 here is deliberately
    // a safe failure: another principal won the identifier concurrently, and
    // this transaction must not steal it or silently merge the principals.
    await tx.principalIdentifier.create({
      data: { dataPrincipalId, type, value } as never,
    });
  }

  private async attachAvailableIdentifiers(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
    record: LinkableNormalizedRecord,
    mappings: readonly NormalizationMapping[],
    knownConflictingPrincipalIds: ReadonlySet<string>,
  ): Promise<void> {
    await this.attachIdentifier(
      tx,
      dataPrincipalId,
      "CUSTOMER_ID",
      verifiedCustomerId(record, mappings),
      knownConflictingPrincipalIds,
    );
    await this.attachIdentifier(
      tx,
      dataPrincipalId,
      "EMAIL",
      record.emailNormalized,
      knownConflictingPrincipalIds,
    );
    await this.attachIdentifier(
      tx,
      dataPrincipalId,
      "PHONE",
      record.phoneNormalized,
      knownConflictingPrincipalIds,
    );
  }

  private candidateResults(result: MatchResult): RaisedCandidate[] {
    if (result.kind === "LINK") {
      return result.candidates;
    }
    if (result.kind === "CANDIDATE") {
      return [
        {
          dataPrincipalId: result.dataPrincipalId,
          confidence: result.confidence,
          score: result.score,
          evidence: result.evidence,
        },
        ...(result.candidates ?? []),
      ];
    }
    return [];
  }

  /**
   * `tx` must be the scoped interactive-transaction client supplied by the
   * sync pipeline. This method intentionally does not open a transaction: all
   * principal/link/candidate state and its audit event(s) commit or roll back
   * together with the caller's normalized-record work.
   */
  async applyMatch(
    tx: ScopedTransactionClient,
    normalizedRecord: LinkableNormalizedRecord,
    result: MatchResult,
    mappings: readonly NormalizationMapping[] = [],
  ): Promise<ApplyMatchResult> {
    const activeLink = await tx.identityLink.findFirst({
      where: { normalizedRecordId: normalizedRecord.id, status: "ACTIVE" },
      select: { dataPrincipalId: true },
    });

    let dataPrincipalId: string | null = activeLink?.dataPrincipalId ?? null;
    const knownConflictingPrincipalIds = new Set(
      this.candidateResults(result).map(
        (candidate) => candidate.dataPrincipalId,
      ),
    );
    let linkCreated = false;
    if (!activeLink && result.kind === "NEW") {
      const principal = await tx.dataPrincipal.create({
        data: {
          reference:
            await this.referenceService.nextPrincipalReferenceInTransaction(tx),
          displayName: displayName(normalizedRecord),
        } as never,
        select: { id: true, reference: true, displayName: true },
      });
      dataPrincipalId = principal.id;
      await this.auditService.record(tx, {
        action: "PRINCIPAL_CREATED",
        resourceType: "DataPrincipal",
        resourceId: principal.id,
        subjectPrincipalId: principal.id,
        metadata: {
          reference: principal.reference,
          displayName: principal.displayName,
        },
      });
    } else if (!activeLink && result.kind === "LINK") {
      dataPrincipalId = result.dataPrincipalId;
    }

    if (dataPrincipalId && !activeLink) {
      // Resolve through the scoped delegate before writing raw FK ids. This is
      // required by tenant.extension.ts because nested Prisma relations are
      // not intercepted by the extension.
      const principal = await tx.dataPrincipal.findFirst({
        where: { id: dataPrincipalId },
        select: { id: true },
      });
      if (!principal) {
        throw new Error(
          `Matched data principal "${dataPrincipalId}" was not found in this organization.`,
        );
      }

      await this.attachAvailableIdentifiers(
        tx,
        dataPrincipalId,
        normalizedRecord,
        mappings,
        knownConflictingPrincipalIds,
      );
      const link = await tx.identityLink.create({
        data: {
          dataPrincipalId,
          normalizedRecordId: normalizedRecord.id,
          confidence: result.kind === "LINK" ? result.confidence : "UNMATCHED",
          matchedOn:
            result.kind === "LINK"
              ? (result.matchedOn as Prisma.InputJsonValue)
              : ({ rule: "UNMATCHED" } as Prisma.InputJsonValue),
        } as never,
        select: { id: true, confidence: true },
      });
      linkCreated = true;
      await this.auditService.record(tx, {
        action: "IDENTITY_LINKED",
        resourceType: "IdentityLink",
        resourceId: link.id,
        subjectPrincipalId: dataPrincipalId,
        metadata: {
          normalizedRecordId: normalizedRecord.id,
          confidence: link.confidence,
          matchedRules:
            result.kind === "LINK" ? result.matchedOn.rules : ["UNMATCHED"],
        },
      });
    }

    let candidatesCreated = 0;
    for (const candidate of this.candidateResults(result)) {
      if (await this.createCandidate(tx, normalizedRecord.id, candidate)) {
        candidatesCreated += 1;
      }
    }
    return { dataPrincipalId, linkCreated, candidatesCreated };
  }
}
