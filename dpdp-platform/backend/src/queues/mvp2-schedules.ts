import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  CONSENT_BACKFILL_QUEUE_NAME,
  CONSENT_BACKFILL_SCHEDULE_TRIGGERED_BY,
} from "./consent-backfill.queue";
import {
  DEADLINE_SCAN_JOB_NAME,
  DEADLINE_SCAN_QUEUE_NAME,
  DEADLINE_SCAN_SCHEDULE_TRIGGERED_BY,
} from "./deadline-scan.queue";
import {
  PRE_ERASURE_NOTICE_QUEUE_NAME,
  RETENTION_SCAN_QUEUE_NAME,
  RETENTION_SCHEDULE_TRIGGERED_BY,
} from "./retention-scan.queue";
import {
  SDF_CYCLE_SCAN_JOB_NAME,
  SDF_CYCLE_SCAN_QUEUE_NAME,
  SDF_CYCLE_SCAN_SCHEDULE_TRIGGERED_BY,
} from "./sdf-cycle-scan.queue";
import { BREACH_CLOCK_QUEUE_NAME } from "./breach-clock.processor";
import {
  ACCESS_LOG_RETENTION_QUEUE_NAME,
  AUDIT_CHAIN_VERIFY_QUEUE_NAME,
} from "./audit-chain-verify.processor";

/** Fixed MVP 2 schedule contracts, reconciled as a cache in Redis at boot. */
export const MVP2_REPEATABLE_SCHEDULES = {
  deadlineScan: { id: "deadline-scan:every-15-min", queue: DEADLINE_SCAN_QUEUE_NAME, pattern: "*/15 * * * *", name: DEADLINE_SCAN_JOB_NAME, data: { triggeredBy: DEADLINE_SCAN_SCHEDULE_TRIGGERED_BY } },
  breachClock: { id: "breach-clock:every-5-min", queue: BREACH_CLOCK_QUEUE_NAME, pattern: "*/5 * * * *", name: BREACH_CLOCK_QUEUE_NAME, data: { triggeredBy: "SCHEDULE" } },
  retentionScan: { id: "retention-scan:daily-01-00", queue: RETENTION_SCAN_QUEUE_NAME, pattern: "0 1 * * *", name: RETENTION_SCAN_QUEUE_NAME, data: { triggeredBy: RETENTION_SCHEDULE_TRIGGERED_BY } },
  preErasureNotice: { id: "pre-erasure-notice:daily-01-30", queue: PRE_ERASURE_NOTICE_QUEUE_NAME, pattern: "30 1 * * *", name: PRE_ERASURE_NOTICE_QUEUE_NAME, data: { triggeredBy: RETENTION_SCHEDULE_TRIGGERED_BY } },
  consentBackfill: { id: "consent-backfill:hourly", queue: CONSENT_BACKFILL_QUEUE_NAME, pattern: "0 * * * *", name: CONSENT_BACKFILL_QUEUE_NAME, data: { triggeredBy: CONSENT_BACKFILL_SCHEDULE_TRIGGERED_BY } },
  sdfCycleScan: { id: "sdf-cycle-scan:daily-02-00", queue: SDF_CYCLE_SCAN_QUEUE_NAME, pattern: "0 2 * * *", name: SDF_CYCLE_SCAN_JOB_NAME, data: { triggeredBy: SDF_CYCLE_SCAN_SCHEDULE_TRIGGERED_BY } },
  auditChainVerify: { id: "audit-chain-verify:daily-03-00", queue: AUDIT_CHAIN_VERIFY_QUEUE_NAME, pattern: "0 3 * * *", name: AUDIT_CHAIN_VERIFY_QUEUE_NAME, data: { triggeredBy: "SCHEDULE" } },
  accessLogRetention: { id: "access-log-retention:daily-04-00", queue: ACCESS_LOG_RETENTION_QUEUE_NAME, pattern: "0 4 * * *", name: ACCESS_LOG_RETENTION_QUEUE_NAME, data: { triggeredBy: "SCHEDULE" } },
} as const;

type SchedulableQueue = Pick<Queue, "upsertJobScheduler">;

/**
 * Re-registers every fixed MVP 2 schedule on each successful boot. Unlike
 * source-sync schedules, these have no Postgres row to compare against;
 * their fixed definitions above are the authoritative source. A Redis
 * flush/deletion is therefore repaired by another idempotent upsert.
 */
@Injectable()
export class Mvp2ScheduleReconciliationService {
  private readonly logger = new Logger(Mvp2ScheduleReconciliationService.name);

  constructor(
    @InjectQueue(DEADLINE_SCAN_QUEUE_NAME) private readonly deadlineScanQueue: SchedulableQueue,
    @InjectQueue(BREACH_CLOCK_QUEUE_NAME) private readonly breachClockQueue: SchedulableQueue,
    @InjectQueue(RETENTION_SCAN_QUEUE_NAME) private readonly retentionScanQueue: SchedulableQueue,
    @InjectQueue(PRE_ERASURE_NOTICE_QUEUE_NAME) private readonly preErasureNoticeQueue: SchedulableQueue,
    @InjectQueue(CONSENT_BACKFILL_QUEUE_NAME) private readonly consentBackfillQueue: SchedulableQueue,
    @InjectQueue(SDF_CYCLE_SCAN_QUEUE_NAME) private readonly sdfCycleScanQueue: SchedulableQueue,
    @InjectQueue(AUDIT_CHAIN_VERIFY_QUEUE_NAME) private readonly auditChainVerifyQueue: SchedulableQueue,
    @InjectQueue(ACCESS_LOG_RETENTION_QUEUE_NAME) private readonly accessLogRetentionQueue: SchedulableQueue,
  ) {}

  async reconcile(): Promise<void> {
    const queues: Record<keyof typeof MVP2_REPEATABLE_SCHEDULES, SchedulableQueue> = {
      deadlineScan: this.deadlineScanQueue, breachClock: this.breachClockQueue, retentionScan: this.retentionScanQueue,
      preErasureNotice: this.preErasureNoticeQueue, consentBackfill: this.consentBackfillQueue, sdfCycleScan: this.sdfCycleScanQueue,
      auditChainVerify: this.auditChainVerifyQueue, accessLogRetention: this.accessLogRetentionQueue,
    };
    await Promise.all(Object.entries(MVP2_REPEATABLE_SCHEDULES).map(async ([key, schedule]) => {
      try {
        await queues[key as keyof typeof MVP2_REPEATABLE_SCHEDULES].upsertJobScheduler(schedule.id, { pattern: schedule.pattern }, { name: schedule.name, data: schedule.data });
      } catch (error) {
        this.logger.warn(`Failed to reconcile MVP 2 schedule "${schedule.id}": ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }));
  }
}
