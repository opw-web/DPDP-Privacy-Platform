import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { AuditService } from "../../common/audit/audit.service";

/**
 * The canonical query shape for "is `dataPrincipalId` under an active
 * non-disclosure direction, and what is its authorisation reference" --
 * §4.12's BD-04, spec line 830: "a small feature with a large failure
 * mode. Test it explicitly."
 *
 * `InformationRequest` carries no expiry/withdrawal column for a
 * non-disclosure direction (confirmed against the schema as built,
 * `task-1-report.md` lines 480-491), so "active" is exactly: any row
 * with `nonDisclosureDirected = true` whose `affectedPrincipalIds`
 * contains this principal. There is no other state machine to consult.
 *
 * This is the EXACT query shape `src/modules/evidence/non-disclosure.ts`
 * (task 12, already shipped) already uses against this same table --
 * `where: { affectedPrincipalIds: { has: dataPrincipalId } }`, split by
 * `nonDisclosureDirected` in application code there because that
 * consumer also needs the non-suppressed rows. `campaigns` (built in
 * parallel, not yet landed) and the frontend only need the boolean/list
 * below. All three MUST agree on this shape -- that is the whole point
 * of documenting it here rather than each consumer re-deriving its own
 * notion of "active".
 */
export interface ActiveNonDisclosureDirection {
  informationRequestId: string;
  reference: string;
  /** Rule 23(2)'s authorisation reference. Empty string, never null, if
   * somehow unset on a row marked directed -- callers should treat an
   * empty authorisationRef as a data-quality problem to flag, not as
   * "no direction". */
  authorisationRef: string;
}

/**
 * Every ACTIVE non-disclosure direction naming `dataPrincipalId`, newest
 * first. Empty array means "not currently under any direction".
 */
export async function findActiveNonDisclosureDirections(
  tx: ScopedTransactionClient,
  dataPrincipalId: string,
): Promise<ActiveNonDisclosureDirection[]> {
  const rows = await tx.informationRequest.findMany({
    where: {
      nonDisclosureDirected: true,
      affectedPrincipalIds: { has: dataPrincipalId },
    },
    orderBy: { receivedAt: "desc" },
    select: { id: true, reference: true, nonDisclosurePermissionRef: true },
  });
  return rows.map((row) => ({
    informationRequestId: row.id,
    reference: row.reference,
    authorisationRef: row.nonDisclosurePermissionRef ?? "",
  }));
}

/** Cheap boolean form of {@link findActiveNonDisclosureDirections} for a
 * caller (e.g. campaign send) that only needs a yes/no gate. */
export async function isUnderActiveNonDisclosure(
  tx: ScopedTransactionClient,
  dataPrincipalId: string,
): Promise<boolean> {
  const count = await tx.informationRequest.count({
    where: {
      nonDisclosureDirected: true,
      affectedPrincipalIds: { has: dataPrincipalId },
    },
  });
  return count > 0;
}

/**
 * Writes the ONE thing every consumer of an active non-disclosure
 * direction must never skip: the internal record that a suppression was
 * applied, carrying the authorisation reference (BD-04's second half --
 * "internal accountability and external non-disclosure are different
 * requirements and both must hold"). Mirrors
 * `evidence/non-disclosure.ts`'s inline `auditService.record` call
 * exactly (same action, same metadata shape) so every caller -- this
 * module's own consumers, `campaigns`, the evidence module -- produces
 * audit rows an auditor reads identically regardless of which surface
 * applied the suppression.
 *
 * Must be called inside the same transaction as the read/send it is
 * documenting, so the suppression and its audit trail commit atomically.
 */
export async function recordNonDisclosureSuppression(
  tx: ScopedTransactionClient,
  auditService: AuditService,
  input: {
    direction: ActiveNonDisclosureDirection;
    dataPrincipalId: string;
    /** What surface applied the suppression, e.g. "campaign-send",
     * "access-report", "evidence-file". Free text for a reader of the
     * audit log; not validated against a fixed vocabulary. */
    context: string;
  },
): Promise<void> {
  await auditService.record(tx, {
    action: "NON_DISCLOSURE_SUPPRESSION_APPLIED",
    resourceType: "InformationRequest",
    resourceId: input.direction.informationRequestId,
    subjectPrincipalId: input.dataPrincipalId,
    metadata: {
      context: input.context,
      reference: input.direction.reference,
      authorisationRef: input.direction.authorisationRef,
    },
  });
}
