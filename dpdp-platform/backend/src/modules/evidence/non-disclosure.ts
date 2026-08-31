import type { InformationRequest } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";

/**
 * BD-04 / task 12 brief: "Anything covered by an active
 * `InformationRequest` with `nonDisclosureDirected = true` must be
 * excluded from her access report and her evidence file -- and the
 * exclusion itself must be written to the internal audit log with the
 * authorisation reference." Two separate obligations, both enforced
 * here in one place so the access report and the evidence file cannot
 * apply the rule differently: leaking a suppressed request to her fails
 * the first; a suppression that never reaches the audit log fails the
 * second.
 *
 * "Active" -- the schema (`InformationRequest`, task 13's table, read
 * directly per this task's brief) carries no expiry/withdrawal column
 * for a non-disclosure direction, so every row with
 * `nonDisclosureDirected = true` naming this principal is treated as a
 * standing direction.
 */
export const INFORMATION_REQUEST_PUBLIC_SELECT = {
  id: true,
  reference: true,
  requestingBody: true,
  authorisedPersonRef: true,
  purposeCited: true,
  receivedAt: true,
  responseDueAt: true,
  nonDisclosureDirected: true,
  nonDisclosurePermissionRef: true,
  respondedAt: true,
  responseReference: true,
} as const;

export type PublicInformationRequest = Pick<
  InformationRequest,
  keyof typeof INFORMATION_REQUEST_PUBLIC_SELECT
>;

export interface NonDisclosureSplit {
  /** Requests naming this principal that are safe to show her (or an employee viewing her file). */
  visible: PublicInformationRequest[];
  /** Requests naming this principal that were suppressed, for the caller to fold into a "suppressed" count if it wants one. */
  suppressedCount: number;
}

/**
 * Splits every `InformationRequest` naming `dataPrincipalId` into what
 * may be shown and what must be suppressed, and writes one
 * `NON_DISCLOSURE_SUPPRESSION_APPLIED` audit event per suppressed
 * request -- inside the caller's own transaction, so the read and the
 * audit trail of what was hidden from it commit atomically.
 */
export async function splitNonDisclosureRequests(
  tx: ScopedTransactionClient,
  auditService: AuditService,
  dataPrincipalId: string,
  context: string,
): Promise<NonDisclosureSplit> {
  const requests = await tx.informationRequest.findMany({
    where: { affectedPrincipalIds: { has: dataPrincipalId } },
    orderBy: { receivedAt: "desc" },
    select: INFORMATION_REQUEST_PUBLIC_SELECT,
  });

  const visible: PublicInformationRequest[] = [];
  let suppressedCount = 0;

  for (const request of requests) {
    if (!request.nonDisclosureDirected) {
      visible.push(request);
      continue;
    }
    suppressedCount += 1;
    await auditService.record(tx, {
      action: "NON_DISCLOSURE_SUPPRESSION_APPLIED",
      resourceType: "InformationRequest",
      resourceId: request.id,
      subjectPrincipalId: dataPrincipalId,
      metadata: {
        context,
        reference: request.reference,
        authorisationRef: request.nonDisclosurePermissionRef ?? "",
      },
    });
  }

  return { visible, suppressedCount };
}
