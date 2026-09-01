import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

/**
 * A durable wake-up for the breach-notice dispatcher.  The authoritative
 * intent is still the `BreachIncident.PRINCIPALS_NOTIFIED` state recorded in
 * Postgres; this job only makes that intent prompt.  `BreachService`'s clock
 * reconciliation re-enqueues any missing job, so a Redis outage or a process
 * crash after the state transaction cannot strand an approved notice.
 */
export const BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME =
  "breach-principal-notice-dispatch";

export interface BreachPrincipalNoticeDispatchJobData {
  breachId: string;
  campaignId: string;
}

export function breachPrincipalNoticeDispatchJobId(
  breachId: string,
  campaignId: string,
): string {
  return `breach-principal-notice:${breachId}:${campaignId}`;
}

@Injectable()
export class BreachPrincipalNoticeDispatchQueueService {
  constructor(
    @InjectQueue(BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME)
    private readonly queue: Queue<BreachPrincipalNoticeDispatchJobData>,
  ) {}

  async enqueue(data: BreachPrincipalNoticeDispatchJobData): Promise<void> {
    await this.queue.add(BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME, data, {
      jobId: breachPrincipalNoticeDispatchJobId(data.breachId, data.campaignId),
      attempts: 3,
      backoff: { type: "fixed", delay: 1_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}
