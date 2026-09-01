/**
 * Bounds how long application boot will wait for a queue schedule
 * registration before giving up and letting the rest of the app start
 * anyway (task 18 review round 2, Important 2). Not a statutory number --
 * an operational safety valve -- but named per this codebase's "no bare
 * literals" convention regardless.
 *
 * There is exactly ONE budget in this codebase, applied ONCE, across
 * every registered queue module concurrently, by
 * `BootRegistrationRegistry` -- not once per module in series. See that
 * class's doc comment for why: bounding each module's `onModuleInit`
 * individually still let worst-case boot time scale linearly with the
 * number of queue modules, since Nest awaits `onModuleInit` sequentially
 * across modules.
 */
export const RECONCILE_BOOT_TIMEOUT_MS = 5_000;

/**
 * Shared boot-safety primitive (task 18 review round 2, Important 2):
 * races `promise` against a plain timer so an unreachable Redis at boot
 * can never block application startup beyond `boundaryMs`. On timeout
 * the original promise is left running in the background rather than
 * cancelled -- harmless for every caller here, since each wraps an
 * idempotent BullMQ upsert (a very-late completion once Redis recovers
 * is a correct, if delayed, registration, never a duplicate or a stale
 * overwrite).
 */
export function withBootTimeout<T>(
  promise: Promise<T>,
  boundaryMs: number = RECONCILE_BOOT_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Exceeded its ${boundaryMs}ms startup budget`));
    }, boundaryMs);
    // Never keep the process alive solely to fire this timeout -- boot
    // either finishes first (clearing it below) or the timeout itself
    // decides the race; either way this timer must not block process
    // exit.
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
