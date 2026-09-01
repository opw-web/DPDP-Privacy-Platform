import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RECONCILE_BOOT_TIMEOUT_MS, withBootTimeout } from "./boot-timeout.util";

interface BootRegistration {
  readonly name: string;
  readonly run: () => Promise<void>;
}

/**
 * Fixes a regression that bounding each queue module's `onModuleInit`
 * INDIVIDUALLY (via `withBootTimeout`) could not: Nest AWAITS every
 * module's `onModuleInit` SEQUENTIALLY, not in parallel, so five
 * independently-bounded 5s stages in series is a 25-30s worst-case boot,
 * not a 5s one -- and it gets worse with every queue module a future
 * wave adds. This registry makes worst-case boot O(1) in the number of
 * registered queues instead of O(n): every queue module hands it a
 * registration THUNK instead of awaiting its own registration in its own
 * `onModuleInit`, and this class runs every thunk CONCURRENTLY, once,
 * under a single shared `RECONCILE_BOOT_TIMEOUT_MS` budget.
 *
 * Registration happens from each queue service's CONSTRUCTOR, never from
 * an `onModuleInit` of its own -- Nest instantiates every provider
 * across the WHOLE application (building the DI graph) before calling
 * ANY `onModuleInit` hook, so by the time this class's own
 * `onModuleInit` runs, every constructor-registered thunk below is
 * already queued up, regardless of which module happens to import which,
 * or in what order.
 *
 * Same invariants `ScheduleReconciliationService` established for the
 * single-service case still hold here for the many-service case: boot is
 * NEVER blocked beyond the one shared budget; a registration failure (or
 * one still pending when the shared budget expires) is logged, never
 * thrown out of boot; Postgres remains authoritative for anything a
 * queue schedule mirrors, so anything missed during an outage is
 * corrected on the next boot, never silently lost.
 */
@Injectable()
export class BootRegistrationRegistry implements OnModuleInit {
  private readonly logger = new Logger(BootRegistrationRegistry.name);
  private readonly registrations: BootRegistration[] = [];

  /**
   * Queues up a boot-time registration thunk. `name` identifies it in any
   * warning this registry logs; `run` performs the actual (idempotent)
   * registration work and is expected to catch and log its own specific
   * failures rather than reject -- this registry's own catch below only
   * covers the "still pending when the shared budget ran out" case, which
   * carries no per-service detail to log.
   */
  register(name: string, run: () => Promise<void>): void {
    this.registrations.push({ name, run });
  }

  async onModuleInit(): Promise<void> {
    if (this.registrations.length === 0) {
      return;
    }
    try {
      const results = await withBootTimeout(
        Promise.allSettled(
          this.registrations.map((registration) => registration.run()),
        ),
        RECONCILE_BOOT_TIMEOUT_MS,
      );
      // Defensive fallback: every registrant in this codebase catches and
      // logs its own failures internally (so its thunk always fulfills),
      // but a rejection is still handled correctly here rather than
      // silently swallowed if that ever stops being true.
      results.forEach((result, index) => {
        const registration = this.registrations[index];
        if (result.status === "rejected" && registration !== undefined) {
          const { name } = registration;
          this.logger.warn(
            `${name} did not register at startup: ` +
              `${
                result.reason instanceof Error
                  ? result.reason.message
                  : "unknown error"
              } -- continuing to boot regardless; this schedule may be ` +
              "stale until a future boot successfully registers it.",
          );
        }
      });
    } catch (err) {
      // withBootTimeout only rejects here if the WHOLE batch failed to
      // settle within the shared budget -- meaning at least one
      // registration is still pending (almost certainly Redis
      // unreachable at boot: `upsertJobScheduler`/`reconcile()` sit in
      // ioredis's offline command queue forever when
      // `maxRetriesPerRequest: null`, per each registrant's own doc
      // comment). Every registered thunk keeps running in the background
      // regardless -- each wraps idempotent BullMQ upserts (or, for
      // `ScheduleReconciliationService`, idempotent upserts and
      // removals), so a very-late completion once Redis recovers is a
      // correct, if delayed, registration, never a duplicate or a stale
      // overwrite.
      const names = this.registrations
        .map((registration) => registration.name)
        .join(", ");
      this.logger.warn(
        "Queue schedule registration did not fully complete within its " +
          `shared ${RECONCILE_BOOT_TIMEOUT_MS}ms startup budget -- ` +
          `continuing to boot regardless; affected schedule(s) among [${names}] ` +
          "may be stale until a future boot successfully registers " +
          `them: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }
}
