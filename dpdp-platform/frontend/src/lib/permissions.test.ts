import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";

describe("hasPermission", () => {
  it("is true when the exact CAN_* code is present", () => {
    expect(hasPermission(["CAN_MANAGE_EMPLOYEES", "CAN_VIEW_AUDIT_LOG"], "CAN_MANAGE_EMPLOYEES")).toBe(
      true,
    );
  });

  it("is false when the code is absent", () => {
    expect(hasPermission(["CAN_VIEW_AUDIT_LOG"], "CAN_MANAGE_EMPLOYEES")).toBe(false);
  });

  it("is false for an empty permission set", () => {
    expect(hasPermission([], "CAN_MANAGE_EMPLOYEES")).toBe(false);
  });

  it("checks membership only -- a role code that happens to share a substring is not a match", () => {
    // Guards against a regression to substring/role-name comparison: the
    // presence of a *role* code must never be mistaken for a *permission*
    // code, even if someone were to (incorrectly) pass role codes in here.
    expect(hasPermission(["ADMIN", "CAN_MANAGE_EMPLOYEE"], "CAN_MANAGE_EMPLOYEES")).toBe(false);
  });
});
