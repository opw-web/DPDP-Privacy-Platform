import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { MatchConfidence } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { ReferenceService } from "../../common/reference/reference.service";
import type { AccessTokenPayload } from "../auth/token.service";
import { AgeService } from "./age.service";
import { AssemblyService } from "./assembly.service";
import { initialPrincipalDisplayName } from "./linking.service";

export interface MergeResult {
  identityLinkId: string;
  dataPrincipalId: string;
  previousDataPrincipalId: string | null;
  created: boolean;
}

export interface UnmergeResult {
  detachedLinkId: string;
  previousDataPrincipalId: string;
  newDataPrincipalId: string;
  newDataPrincipalReference: string;
}

export interface MergeParams {
  confidence: MatchConfidence;
  linkedByEmployeeId: string;
  matchedOn: Record<string, unknown>;
}

/**
 * Owns the two link-topology operations this task's review layer exposes:
 *
 *  - `mergeRecordIntoPrincipal` ("merge" -- spec line 779: "Merge is
 *    re-parenting an IdentityLink"). It is not its own HTTP route: the
 *    spec's API surface has no direct merge endpoint, only
 *    `POST /api/match-candidates/:id/confirm`, which calls this to make
 *    the confirmed record/principal pairing real.
 *  - `unmerge` (`POST /api/principals/:id/unmerge`): detaches a link with
 *    a reason and gives the detached record a fresh principal.
 *
 * Both rebuild every profile they touch via `AssemblyService.rebuild`
 * inside the SAME transaction as the structural change, per the task
 * brief. Neither ever touches `SourceRecord`/`NormalizedRecord` rows --
 * that is the evidentiary line Check 9 exists to enforce.
 */
@Injectable()
export class MergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referenceService: ReferenceService,
    private readonly auditService: AuditService,
    private readonly assemblyService: AssemblyService,
    private readonly ageService: AgeService,
  ) {}

  /**
   * Re-parents the record's ACTIVE `IdentityLink` onto `targetDataPrincipalId`
   * (creating one if the record currently has none at all -- an edge case,
   * e.g. a DETACHED-suppressed record that has never resynced since; see
   * `LinkingService.applyMatch`). The common case for BOTH a rules-1-3
   * conflict candidate (record auto-linked to the higher-confidence winner,
   * candidate raised against the loser) and a rule-4 POSSIBLE
   * supporting-signal candidate (record given its own new principal per
   * spec 4.4 rule 5, candidate raised against the OTHER, similar-looking
   * principal -- see `LinkingService.applyMatch`'s `result.kind ===
   * "CANDIDATE"` branch) is that the record IS already linked, just to a
   * DIFFERENT principal than the one being confirmed: this re-parents that
   * SAME link row rather than detaching-and-recreating -- literally
   * "re-parenting", not "unmerge then merge". Confirming a rule-4 candidate
   * this way can leave the record's original (solo) principal with zero
   * active links -- nothing in the schema forbids that state, but it is a
   * newly-reachable one worth knowing about when reading principal counts
   * after a confirm. Both the old and new principal's profiles are
   * rebuilt when a re-parent actually changes ownership.
   */
  async mergeRecordIntoPrincipal(
    tx: ScopedTransactionClient,
    normalizedRecordId: string,
    targetDataPrincipalId: string,
    params: MergeParams,
  ): Promise<MergeResult> {
    const record = await tx.normalizedRecord.findFirst({
      where: { id: normalizedRecordId },
      select: { id: true },
    });
    if (!record) {
      throw new NotFoundException(
        `Normalized record "${normalizedRecordId}" not found.`,
      );
    }
    const target = await tx.dataPrincipal.findFirst({
      where: { id: targetDataPrincipalId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException(
        `Data principal "${targetDataPrincipalId}" not found.`,
      );
    }

    const currentLink = await tx.identityLink.findFirst({
      where: { normalizedRecordId, status: "ACTIVE" },
      select: { id: true, dataPrincipalId: true },
    });

    let identityLinkId: string;
    let created = false;
    let previousDataPrincipalId: string | null = null;

    if (!currentLink) {
      const created_ = await tx.identityLink.create({
        data: {
          dataPrincipalId: targetDataPrincipalId,
          normalizedRecordId,
          confidence: params.confidence,
          matchedOn: params.matchedOn as never,
          linkedByEmployeeId: params.linkedByEmployeeId,
        } as never,
        select: { id: true },
      });
      identityLinkId = created_.id;
      created = true;
    } else {
      if (currentLink.dataPrincipalId !== targetDataPrincipalId) {
        previousDataPrincipalId = currentLink.dataPrincipalId;
      }
      const updated = await tx.identityLink.update({
        where: { id: currentLink.id },
        data: {
          dataPrincipalId: targetDataPrincipalId,
          confidence: params.confidence,
          matchedOn: params.matchedOn as never,
          linkedByEmployeeId: params.linkedByEmployeeId,
        },
        select: { id: true },
      });
      identityLinkId = updated.id;
    }

    await this.auditService.record(tx, {
      action: "IDENTITY_LINKED",
      resourceType: "IdentityLink",
      resourceId: identityLinkId,
      subjectPrincipalId: targetDataPrincipalId,
      metadata: {
        normalizedRecordId,
        confidence: params.confidence,
        source: "MANUAL_CANDIDATE_CONFIRM",
        previousDataPrincipalId,
      },
    });

    await this.assemblyService.rebuild(tx, targetDataPrincipalId);
    await this.ageService.derive(tx, targetDataPrincipalId);
    if (previousDataPrincipalId) {
      await this.assemblyService.rebuild(tx, previousDataPrincipalId);
      await this.ageService.derive(tx, previousDataPrincipalId);
    }

    return {
      identityLinkId,
      dataPrincipalId: targetDataPrincipalId,
      previousDataPrincipalId,
      created,
    };
  }

  /**
   * Detaches `normalizedRecordId`'s ACTIVE link from `principalId` with a
   * reason, creates a brand-new `DataPrincipal` for the detached record,
   * links the record to it, and rebuilds both profiles -- all inside one
   * transaction. Writes exactly the two audit events the brief specifies
   * (`IDENTITY_DETACHED`, `PRINCIPAL_CREATED`); the new link itself is
   * deliberately not a third `IDENTITY_LINKED` event -- `PRINCIPAL_CREATED`'s
   * metadata already names the record that now belongs to it.
   *
   * Deliberately never moves `PrincipalIdentifier` ownership: the
   * shared email/phone stays with the ORIGINAL principal (moving it would
   * strip that principal of an identifier every OTHER of its records still
   * legitimately shares, and would re-match every other record sharing it
   * onto the new principal instead). `LinkingService.applyMatch`'s
   * DETACHED-pair check is what stops that identifier from silently
   * re-linking this exact record back on a later resync.
   */
  async unmerge(
    principalId: string,
    normalizedRecordId: string,
    reason: string,
    actor: AccessTokenPayload,
  ): Promise<UnmergeResult> {
    return this.prisma.scoped.$transaction(async (tx) => {
      const principal = await tx.dataPrincipal.findFirst({
        where: { id: principalId },
        select: { id: true },
      });
      if (!principal) {
        throw new NotFoundException(
          `Data principal "${principalId}" not found.`,
        );
      }

      const link = await tx.identityLink.findFirst({
        where: {
          dataPrincipalId: principalId,
          normalizedRecordId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!link) {
        throw new NotFoundException(
          `No active link between data principal "${principalId}" and ` +
            `normalized record "${normalizedRecordId}".`,
        );
      }

      const activeLinkCount = await tx.identityLink.count({
        where: { dataPrincipalId: principalId, status: "ACTIVE" },
      });
      if (activeLinkCount <= 1) {
        // Ambiguity ruling (task brief): never name the principal's actual
        // data here -- no display name, email, or phone. State the
        // principal by id only.
        throw new BadRequestException(
          `Data principal "${principalId}" has only one linked record; ` +
            "unmerging it would leave the principal with none. Unmerge " +
            "requires at least one other record to remain linked.",
        );
      }

      const record = await tx.normalizedRecord.findFirst({
        where: { id: normalizedRecordId },
        select: { fullName: true, firstName: true, lastName: true },
      });
      if (!record) {
        throw new NotFoundException(
          `Normalized record "${normalizedRecordId}" not found.`,
        );
      }

      const detachedAt = new Date();
      await tx.identityLink.update({
        where: { id: link.id },
        data: { status: "DETACHED", detachedAt, detachReason: reason },
      });
      await this.auditService.record(tx, {
        action: "IDENTITY_DETACHED",
        resourceType: "IdentityLink",
        resourceId: link.id,
        subjectPrincipalId: principalId,
        metadata: {
          normalizedRecordId,
          previousDataPrincipalId: principalId,
        },
      });

      const newReference =
        await this.referenceService.nextPrincipalReferenceInTransaction(tx);
      const newPrincipal = await tx.dataPrincipal.create({
        data: {
          reference: newReference,
          displayName: initialPrincipalDisplayName({
            id: normalizedRecordId,
            fullName: record.fullName,
            firstName: record.firstName,
            lastName: record.lastName,
            emailNormalized: null,
            phoneNormalized: null,
            customerId: null,
          }),
        } as never,
        select: { id: true, reference: true },
      });

      await tx.identityLink.create({
        data: {
          dataPrincipalId: newPrincipal.id,
          normalizedRecordId,
          confidence: "UNMATCHED",
          matchedOn: { rule: "MANUAL_UNMERGE" } as never,
          linkedByEmployeeId: actor.sub,
        } as never,
      });

      await this.auditService.record(tx, {
        action: "PRINCIPAL_CREATED",
        resourceType: "DataPrincipal",
        resourceId: newPrincipal.id,
        subjectPrincipalId: newPrincipal.id,
        metadata: {
          reference: newPrincipal.reference,
          reason: "UNMERGE",
          normalizedRecordId,
          detachedFromDataPrincipalId: principalId,
        },
      });

      await this.assemblyService.rebuild(tx, principalId);
      await this.assemblyService.rebuild(tx, newPrincipal.id);
      await this.ageService.derive(tx, principalId);
      await this.ageService.derive(tx, newPrincipal.id);

      return {
        detachedLinkId: link.id,
        previousDataPrincipalId: principalId,
        newDataPrincipalId: newPrincipal.id,
        newDataPrincipalReference: newPrincipal.reference,
      };
    });
  }
}
