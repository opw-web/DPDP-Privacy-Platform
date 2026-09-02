import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { ReferenceService } from "../../common/reference/reference.service";
import type { NormalizationMapping } from "../normalization/normalization.service";
import {
  conflictCandidateScore,
  type MatchResult,
  type RaisedCandidate,
} from "./matching.service";
import { verifiedCustomerIdValue } from "./match-rules/customer-id";
import { AgeService } from "./age.service";
import { AssemblyService } from "./assembly.service";

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
  /**
   * True exactly when this call created a brand-new `DataPrincipal` row
   * (spec 4.4 rule 5: "Otherwise UNMATCHED -> new DataPrincipal", which
   * applies whenever rules 1-3 found no exact identifier match --
   * regardless of whether rule 4 ALSO raised a POSSIBLE candidate).
   * Callers must use this flag, not `matchResult.kind === "NEW"`, to
   * decide whether a principal was freshly created: a CANDIDATE result
   * creates one too (see the `result.kind === "CANDIDATE"` branch below).
   */
  principalCreated: boolean;
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

/**
 * Exported (Task 19) so `MergeService.unmerge()` names a freshly split-off
 * principal the same way a freshly matched-NEW one is named here -- one
 * naming rule for "a DataPrincipal row was just created for this one
 * record", not two that could drift apart.
 */
export function initialPrincipalDisplayName(
  record: LinkableNormalizedRecord,
): string {
  if (record.fullName) {
    return record.fullName;
  }
  const name = [record.firstName, record.lastName].filter(Boolean).join(" ");
  return name || "Unnamed principal";
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
    private readonly assemblyService: AssemblyService,
    private readonly ageService: AgeService,
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
    onUnknownConflict: "throw" | "skip",
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
        // exact-vs-high conflict flow unusable.
        if (knownConflictingPrincipalIds.has(existing.dataPrincipalId)) {
          return;
        }
        // I-3 (final whole-branch review) re-review: an ownership
        // surprise NOT represented in MatchResult still fails the
        // transaction for the FRESHLY-linked case (`onUnknownConflict:
        // "throw"`, unchanged) -- there, matching was just computed for
        // exactly this record's identifiers, so any other conflict is a
        // genuine integrity surprise. It must NOT fail for the
        // ALREADY-linked resync case (`"skip"`): a DETACHED pair
        // (`MergeService.unmerge`'s documented invariant -- identifier
        // ownership deliberately never moves on unmerge) is EXACTLY a
        // case where an already-linked record's identifiers legitimately
        // belong to a DIFFERENT principal than its own active link,
        // forever, and `MatchingService.match` has no notion of DETACHED
        // links at all, so it cannot have raised that as a candidate.
        // Treating that expected, permanent state as a hard failure would
        // turn every future resync of a legitimately-unmerged record into
        // a failed record on every single sync, rather than the
        // documented no-op ("reversible identity": a resync must never
        // silently move a link matching alone would have re-decided).
        if (onUnknownConflict === "skip") {
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
    onUnknownConflict: "throw" | "skip",
  ): Promise<void> {
    await this.attachIdentifier(
      tx,
      dataPrincipalId,
      "CUSTOMER_ID",
      verifiedCustomerIdValue(record.customerId, mappings),
      knownConflictingPrincipalIds,
      onUnknownConflict,
    );
    await this.attachIdentifier(
      tx,
      dataPrincipalId,
      "EMAIL",
      record.emailNormalized,
      knownConflictingPrincipalIds,
      onUnknownConflict,
    );
    await this.attachIdentifier(
      tx,
      dataPrincipalId,
      "PHONE",
      record.phoneNormalized,
      knownConflictingPrincipalIds,
      onUnknownConflict,
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
   * Raw scalar relation fields bypass Prisma extension interception. Verify
   * every caller-supplied id through this transaction's scoped delegates
   * before any principal-side row or audit event is written.
   */
  private async verifyScopedReferences(
    tx: ScopedTransactionClient,
    normalizedRecordId: string,
    result: MatchResult,
  ): Promise<void> {
    const record = await tx.normalizedRecord.findFirst({
      where: { id: normalizedRecordId },
      select: { id: true },
    });
    if (!record) {
      throw new NotFoundException(
        `Normalized record "${normalizedRecordId}" not found.`,
      );
    }

    const targetIds = new Set(
      this.candidateResults(result).map(
        (candidate) => candidate.dataPrincipalId,
      ),
    );
    if (result.kind === "LINK") {
      targetIds.add(result.dataPrincipalId);
    }
    for (const dataPrincipalId of targetIds) {
      const principal = await tx.dataPrincipal.findFirst({
        where: { id: dataPrincipalId },
        select: { id: true },
      });
      if (!principal) {
        throw new NotFoundException(
          `Matched data principal "${dataPrincipalId}" not found.`,
        );
      }
    }
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
    await this.verifyScopedReferences(tx, normalizedRecord.id, result);

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
    let principalCreated = false;
    let suppressedLinkCandidate: RaisedCandidate | null = null;
    // Spec 4.4 rule 5 ("Otherwise UNMATCHED -> new DataPrincipal") applies
    // whenever rules 1-3 found no exact identifier match for this record --
    // that is exactly `MatchingService.match`'s "NEW" and "CANDIDATE" kinds
    // (a CANDIDATE result is rule 4's POSSIBLE supporting-signal match,
    // which raises a MatchCandidate for human review but, per spec, "Do not
    // link" -- it does not suppress rule 5). Both kinds therefore get their
    // OWN new principal here: this is what keeps a person whose only
    // evidence is an ambiguous name/pincode match SEPARATE from the
    // candidate's target principal (the same "kept apart by default"
    // guarantee already given to the two Rahul Vermas), rather than leaving
    // the record in limbo with no principal at all until a human reviews
    // it. The pending MatchCandidate raised below is what lets a reviewer
    // merge the two later via confirm -- never an automatic decision.
    if (!activeLink && (result.kind === "NEW" || result.kind === "CANDIDATE")) {
      const principal = await tx.dataPrincipal.create({
        data: {
          reference:
            await this.referenceService.nextPrincipalReferenceInTransaction(tx),
          displayName: initialPrincipalDisplayName(normalizedRecord),
        } as never,
        select: { id: true, reference: true, displayName: true },
      });
      dataPrincipalId = principal.id;
      principalCreated = true;
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
      // Controller ruling (Task 19): a DETACHED link on this exact
      // (normalizedRecord, dataPrincipal) pair means a human already
      // decided, via unmerge, that this record does not belong to that
      // principal. Unmerge deliberately never moves PrincipalIdentifier
      // ownership (see MergeService.unmerge's doc comment), so a later
      // resync of this same record can resolve the exact same EXACT/HIGH
      // signal right back to that principal. Auto-linking here would
      // silently reverse the human's decision -- the audit trail would
      // read IDENTITY_DETACHED then IDENTITY_LINKED as though the system
      // changed its mind on its own. Raise a candidate for human review
      // instead: the evidence is real, but the decision is not ours.
      const previouslyDetached = await tx.identityLink.findFirst({
        where: {
          normalizedRecordId: normalizedRecord.id,
          dataPrincipalId: result.dataPrincipalId,
          status: "DETACHED",
        },
        select: { id: true },
      });
      if (previouslyDetached) {
        suppressedLinkCandidate = {
          dataPrincipalId: result.dataPrincipalId,
          confidence: result.confidence,
          score: conflictCandidateScore(result.confidence),
          evidence: {
            rule: "DETACHED_LINK_SUPPRESSED",
            matchedOn: result.matchedOn,
          },
        };
      } else {
        dataPrincipalId = result.dataPrincipalId;
      }
    }

    // I-3 (final whole-branch review): attaching identifiers used to be
    // guarded on `!activeLink`, so an identifier that first appears on a
    // RESYNC of an already-linked record (e.g. a support ticket that only
    // had a phone number at first sync later gets an email added) was
    // never attached. The next source's record for that same person would
    // then find the email unowned and create a duplicate principal -- a
    // silent, permanent under-merge. Split into two calls rather than one
    // shared call, because the two cases need DIFFERENT conflict
    // handling, not just a different `dataPrincipalId`:
    //
    //   - Freshly linked (`!activeLink`, unchanged): an unexpected
    //     ownership conflict here is a genuine surprise -- matching was
    //     just computed for exactly this record's identifiers -- so it
    //     still fails the transaction (`onUnknownConflict: "throw"`).
    //   - Already linked (`activeLink`, the new case): the advisory lock
    //     covering these exact signals is already held for the whole of
    //     `applyMatch` (see `sync-pipeline.service.ts`), so a genuinely
    //     unowned identifier still attaches safely. But an ownership
    //     conflict here must NOT throw (`onUnknownConflict: "skip"`): a
    //     DETACHED pair (`MergeService.unmerge` deliberately never moves
    //     `PrincipalIdentifier` ownership) is exactly a case where an
    //     already-linked record's identifiers legitimately belong to a
    //     DIFFERENT principal than its own active link, permanently, and
    //     `MatchingService.match` has no notion of DETACHED links at all
    //     -- it cannot have raised that as a candidate. Throwing there
    //     would turn every future resync of a legitimately-unmerged
    //     record into a failed record on every sync, instead of the
    //     documented no-op ("reversible identity": a resync must never
    //     silently move a link matching alone would have re-decided).
    if (dataPrincipalId && !activeLink) {
      await this.attachAvailableIdentifiers(
        tx,
        dataPrincipalId,
        normalizedRecord,
        mappings,
        knownConflictingPrincipalIds,
        "throw",
      );
    } else if (dataPrincipalId && activeLink) {
      await this.attachAvailableIdentifiers(
        tx,
        dataPrincipalId,
        normalizedRecord,
        mappings,
        knownConflictingPrincipalIds,
        "skip",
      );
    }

    if (dataPrincipalId && !activeLink) {
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
    const candidatesToRaise = suppressedLinkCandidate
      ? [suppressedLinkCandidate, ...this.candidateResults(result)]
      : this.candidateResults(result);
    for (const candidate of candidatesToRaise) {
      if (await this.createCandidate(tx, normalizedRecord.id, candidate)) {
        candidatesCreated += 1;
      }
    }
    if (linkCreated && dataPrincipalId) {
      // Derived profile rows are part of the link's transaction and causation;
      // only the age state has its own mandated audit action.
      await this.assemblyService.rebuild(tx, dataPrincipalId);
      await this.ageService.derive(tx, dataPrincipalId);
    }
    return { dataPrincipalId, linkCreated, principalCreated, candidatesCreated };
  }
}
