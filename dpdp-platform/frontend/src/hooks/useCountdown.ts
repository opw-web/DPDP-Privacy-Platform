import { useEffect, useState } from "react";

export interface CountdownState {
  /** Milliseconds remaining until `targetIso`; zero or negative once past due. */
  remainingMs: number;
  /** `remainingMs <= 0`. */
  isPastDue: boolean;
}

function computeRemaining(targetIso: string, nowMs: number): CountdownState {
  const targetMs = new Date(targetIso).getTime();
  const remainingMs = targetMs - nowMs;
  return { remainingMs, isPastDue: remainingMs <= 0 };
}

/**
 * Hand-written countdown ticker (spec line 64: no countdown/timer library).
 * Recomputes `remainingMs` against `Date.now()` on mount and then every
 * `intervalMs`, so a component reading this hook's return value stays
 * live -- e.g. `DeadlinePill` flipping from amber to orange, or from "in 1
 * day" to "overdue", without anything outside it forcing a re-render.
 *
 * Deadlines in this system are day/hour granularity, not second
 * granularity, so the default tick is 60s -- frequent enough that no pill
 * is ever visibly stale, not so frequent it churns the DOM or a test's
 * fake timers for no reason. Pass a smaller `intervalMs` (as tests do) to
 * observe a boundary crossing without waiting 60s of fake-timer ticks.
 */
export function useCountdown(targetIso: string, intervalMs = 60_000): CountdownState {
  const [state, setState] = useState<CountdownState>(() =>
    computeRemaining(targetIso, Date.now()),
  );

  useEffect(() => {
    setState(computeRemaining(targetIso, Date.now()));
    const id = setInterval(() => {
      setState(computeRemaining(targetIso, Date.now()));
    }, intervalMs);
    return () => clearInterval(id);
  }, [targetIso, intervalMs]);

  return state;
}
