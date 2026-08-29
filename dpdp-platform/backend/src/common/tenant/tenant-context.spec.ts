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

  /**
   * A minimal stand-in for Prisma's lazy `PrismaPromise`: nothing runs
   * until `.then()` is called, at which point it invokes `dispatch()` --
   * this is what `run()`'s thenable-detection exists to handle correctly.
   */
  function lazyThenable<T>(dispatch: () => T): PromiseLike<T> {
    return {
      then(onFulfilled) {
        return Promise.resolve(dispatch()).then(onFulfilled as never);
      },
    };
  }

  it("keeps the store bound at dispatch time for a thenable returned directly by fn()", async () => {
    const store = {
      organizationId: "org-direct",
      actorType: "SYSTEM" as const,
      actorId: null,
      actorLabel: "job",
    };

    const seen: Array<string | null> = [];
    const result = TenantContext.run(store, () =>
      lazyThenable(() => {
        seen.push(TenantContext.getOrNull()?.organizationId ?? null);
        return "done";
      }),
    );

    // The thenable is awaited OUTSIDE run() -- exactly the calling style
    // that broke before run() detected and re-bound thenable results.
    await expect(result).resolves.toBe("done");
    expect(seen).toEqual(["org-direct"]);
  });

  it("documents the one failure mode run() cannot catch: a thenable NOT returned directly by fn()", async () => {
    const storeA = {
      organizationId: "org-a-container",
      actorType: "SYSTEM" as const,
      actorId: null,
      actorLabel: "job-a",
    };
    const storeB = {
      organizationId: "org-b-container",
      actorType: "SYSTEM" as const,
      actorId: null,
      actorLabel: "job-b",
    };

    const seen: Array<string | null> = [];
    // fn() returns a plain object CONTAINING a thenable, not the thenable
    // itself -- run()'s isThenable() check on fn()'s return value cannot
    // see inside it, so no re-binding happens for `container.q`.
    const container = TenantContext.run(storeA, () => ({
      q: lazyThenable(() => {
        seen.push(TenantContext.getOrNull()?.organizationId ?? null);
        return "done";
      }),
    }));

    // Awaiting the stashed thenable inside a DIFFERENT tenant's run() is
    // exactly the documented hazard: the query dispatches under org B's
    // context, not org A's, even though it was created while org A's
    // context was active.
    await TenantContext.run(storeB, () => container.q);

    expect(seen).toEqual(["org-b-container"]);
  });

  it("does not leak the context after run() returns", () => {
    TenantContext.run(
      {
        organizationId: "org-1",
        actorType: "PRINCIPAL",
        actorId: "dp-1",
        actorLabel: "Bob",
        dataPrincipalId: "dp-1",
      },
      () => undefined,
    );

    expect(TenantContext.getOrNull()).toBeNull();
  });
});
