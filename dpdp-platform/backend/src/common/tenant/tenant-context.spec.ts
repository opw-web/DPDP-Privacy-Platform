import { TenantContext } from "./tenant-context";

describe("TenantContext", () => {
  it("throws when get() is called with no context bound", () => {
    expect(() => TenantContext.get()).toThrow(/no tenant context bound/);
  });

  it("returns null from getOrNull() with no context bound", () => {
    expect(TenantContext.getOrNull()).toBeNull();
  });

  it("returns the bound store inside run()", () => {
    const store = {
      organizationId: "org-1",
      actorType: "EMPLOYEE" as const,
      actorId: "emp-1",
      actorLabel: "Alice",
    };

    TenantContext.run(store, () => {
      expect(TenantContext.get()).toEqual(store);
      expect(TenantContext.getOrNull()).toEqual(store);
    });
  });

  it("isolates concurrent contexts from each other", async () => {
    const results: string[] = [];

    const runA = TenantContext.run(
      {
        organizationId: "org-a",
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: "job-a",
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(TenantContext.get().organizationId);
      },
    );

    const runB = TenantContext.run(
      {
        organizationId: "org-b",
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: "job-b",
      },
      async () => {
        results.push(TenantContext.get().organizationId);
      },
    );

    await Promise.all([runA, runB]);

    expect(results).toEqual(["org-b", "org-a"]);
  });

  it("does not leak the context after run() returns", () => {
    TenantContext.run(
      {
        organizationId: "org-1",
        actorType: "PRINCIPAL",
        actorId: "dp-1",
        actorLabel: "Bob",
      },
      () => undefined,
    );

    expect(TenantContext.getOrNull()).toBeNull();
  });
});
