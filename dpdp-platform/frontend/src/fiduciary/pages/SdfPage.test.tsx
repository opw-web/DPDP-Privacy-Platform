import { describe, expect, it } from "vitest";
import { canCompleteAudit } from "./SdfPage";

describe("SDF readiness", () => {
  it("allows a non-SDF readiness view", () => {
    expect({ isSignificantDataFiduciary: false }).toMatchObject({ isSignificantDataFiduciary: false });
  });

  it("does not allow an AUDIT assessment to complete without independence", () => {
    expect(canCompleteAudit({ kind: "AUDIT", isIndependent: false })).toBe(false);
    expect(canCompleteAudit({ kind: "AUDIT", isIndependent: true })).toBe(true);
  });
});
