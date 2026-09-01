import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { lockRetentionWorkflow } from "./retention-transaction-lock.util";

export interface RecordPurposeServedInput {
  dataPrincipalId: string;
  retentionPolicyId: string;
  /** The business workflow's actual completion time, rather than scan time. */
  servedAt?: Date;
}

export const PURPOSE_SERVED_SIGNAL_PUBLIC_SELECT = {
  id: true,
  dataPrincipalId: true,
  retentionPolicyId: true,
  servedAt: true,
  scheduledAt: true,
  createdAt: true,
} satisfies Prisma.PurposeServedSignalSelect;

export type PublicPurposeServedSignal = Prisma.PurposeServedSignalGetPayload<{
  select: typeof PURPOSE_SERVED_SIGNAL_PUBLIC_SELECT;
}>;

/**
 * The explicit producer for a PURPOSE_SERVED signal. Business integrations
 * call this from their own transaction when the policy's purpose is actually
 * fulfilled; the nightly scanner only consumes this durable fact and never
 * guesses from a purpose being inactive or from elapsed time.
 */
@Injectable()
export class PurposeServedService {
  constructor(private readonly auditService: AuditService) {}

  async record(
    tx: ScopedTransactionClient,
    input: RecordPurposeServedInput,
  ): Promise<PublicPurposeServedSignal> {
    await lockRetentionWorkflow(
      tx,
      `purpose-served:${input.dataPrincipalId}:${input.retentionPolicyId}`,
    );

    const existing = await tx.purposeServedSignal.findFirst({
      where: {
        dataPrincipalId: input.dataPrincipalId,
        retentionPolicyId: input.retentionPolicyId,
      },
      select: PURPOSE_SERVED_SIGNAL_PUBLIC_SELECT,
    });
    if (existing) {
      return existing;
    }

    const [principal, policy] = await Promise.all([
      tx.dataPrincipal.findFirst({
        where: { id: input.dataPrincipalId },
        select: { id: true },
      }),
      tx.retentionPolicy.findFirst({
        where: { id: input.retentionPolicyId },
        select: { id: true, triggerType: true, active: true },
      }),
    ]);
    if (!principal) {
      throw new NotFoundException(`Data principal "${input.dataPrincipalId}" not found.`);
    }
    if (!policy) {
      throw new NotFoundException(`Retention policy "${input.retentionPolicyId}" not found.`);
    }
    if (policy.triggerType !== "PURPOSE_SERVED" || !policy.active) {
      throw new BadRequestException(
        "A purpose-served signal requires an active PURPOSE_SERVED retention policy.",
      );
    }

    const created = await tx.purposeServedSignal.create({
      data: {
        dataPrincipalId: input.dataPrincipalId,
        retentionPolicyId: input.retentionPolicyId,
        servedAt: input.servedAt ?? new Date(),
      } as never,
      select: PURPOSE_SERVED_SIGNAL_PUBLIC_SELECT,
    });
    await this.auditService.record(tx, {
      action: "PURPOSE_SERVED_RECORDED",
      resourceType: "PurposeServedSignal",
      resourceId: created.id,
      subjectPrincipalId: created.dataPrincipalId,
      metadata: {
        retentionPolicyId: created.retentionPolicyId,
        servedAt: created.servedAt,
      },
    });
    return created;
  }
}
