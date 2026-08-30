import {
  describeSyncError,
  MissingRecordKeyError,
  SyncLockUnavailableError,
} from "./sync-error";

// Named to match `err.constructor.name`, exactly like the real (private,
// unexported) `IdentifierOwnershipConflictError` in
// src/modules/identity/linking.service.ts -- this fixture exists only so
// this spec does not need to import that internal class.
class IdentifierOwnershipConflictError extends Error {
  constructor(type: string, value: string) {
    super(
      `Cannot attach ${type} identifier "${value}": it already belongs to a different data principal.`,
    );
    this.name = "IdentifierOwnershipConflictError";
  }
}

describe("describeSyncError", () => {
  it("returns class name only for a non-Error thrown value", () => {
    expect(describeSyncError("boom")).toEqual({ errorClass: "UnknownError" });
    expect(describeSyncError(null)).toEqual({ errorClass: "UnknownError" });
  });

  it("drops the message for an error class not on the allow-list -- fail closed", () => {
    class SomeFutureDomainError extends Error {}
    const err = new SomeFutureDomainError("contains aman@example.test maybe");
    expect(describeSyncError(err)).toEqual({
      errorClass: "SomeFutureDomainError",
    });
  });

  it("drops the message for the ONE known error class that embeds a field value", () => {
    const err = new IdentifierOwnershipConflictError(
      "EMAIL",
      "leaked@example.test",
    );
    const described = describeSyncError(err);
    expect(described.errorClass).toBe("IdentifierOwnershipConflictError");
    expect(described.message).toBeUndefined();
    expect(JSON.stringify(described)).not.toContain("leaked@example.test");
  });

  it("keeps the message for connector/network errors vetted as value-free", () => {
    class PageCapExceededError extends Error {}
    const err = new PageCapExceededError(
      'RestApiConnector for data source "demo" exceeded the 500-page hard cap',
    );
    expect(describeSyncError(err)).toEqual({
      errorClass: "PageCapExceededError",
      message: err.message,
    });
  });

  it("keeps the message for this pipeline's own MissingRecordKeyError", () => {
    const err = new MissingRecordKeyError();
    const described = describeSyncError(err);
    expect(described.errorClass).toBe("MissingRecordKeyError");
    expect(described.message).toBe(err.message);
  });

  it("keeps the message for NotFoundException", () => {
    class NotFoundException extends Error {}
    const err = new NotFoundException('Data principal "abc-123" not found.');
    expect(describeSyncError(err)).toEqual({
      errorClass: "NotFoundException",
      message: err.message,
    });
  });

  it("keeps the message for SyncLockUnavailableError", () => {
    const err = new SyncLockUnavailableError("ds-123");
    const described = describeSyncError(err);
    expect(described.errorClass).toBe("SyncLockUnavailableError");
    expect(described.message).toBe(err.message);
  });
});
