import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "./useCountdown";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports not-past-due with a positive remainder before the target instant", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { result } = renderHook(() => useCountdown("2026-01-01T00:00:30.000Z", 10_000));

    expect(result.current.isPastDue).toBe(false);
    expect(result.current.remainingMs).toBe(30_000);
  });

  it("flips to past-due with a non-positive remainder once a tick crosses the target instant", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { result } = renderHook(() => useCountdown("2026-01-01T00:00:30.000Z", 10_000));

    expect(result.current.isPastDue).toBe(false);

    // Advancing fake timers moves both the interval ticks AND `Date.now()`
    // forward together, the way real time would: 4 ticks of 10s crosses
    // the 30s target and lands the clock at 00:00:40 (10s past it).
    act(() => {
      vi.advanceTimersByTime(40_000);
    });

    expect(result.current.isPastDue).toBe(true);
    expect(result.current.remainingMs).toBeLessThanOrEqual(0);
    expect(result.current.remainingMs).toBe(-10_000);
  });

  it("clears its interval on unmount (no leaked timer)", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() => useCountdown("2026-01-01T00:00:30.000Z", 10_000));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
