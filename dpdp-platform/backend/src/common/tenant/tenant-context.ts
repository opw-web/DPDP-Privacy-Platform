import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is making the current request/job, and which organization they act
 * within. Every code path that touches a tenant-scoped Prisma model must
 * run inside a context populated with this shape -- there is no default
 * organization and no way to opt out of scoping from inside a service.
 */
export interface TenantStore {
  organizationId: string;
  actorType: "EMPLOYEE" | "PRINCIPAL" | "SYSTEM";
  actorId: string | null;
  actorLabel: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Thin wrapper around Node's AsyncLocalStorage carrying the current
 * tenant/actor for the lifetime of a request or background job.
 *
 * `TenantContext.get()` is the only way application code (and the Prisma
 * extension) learns the current organizationId -- it is never passed as a
 * function argument or read off a request object down in a service.
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

export const TenantContext = {
  /**
   * Runs `fn` with `store` bound as the current tenant context.
   *
   * Prisma's extended-client operations (e.g. `prisma.scoped.x.findMany()`)
   * return a lazy thenable that does not actually dispatch the query --
   * and so does not reach the tenant-scoping extension -- until something
   * calls `.then()`/awaits it. If that happens to be code outside this
   * `run()` call (the common style: `await TenantContext.run(store, () =>
   * prisma.scoped.x.findMany())`), Node's AsyncLocalStorage context is
   * already gone by the time the query actually executes, and the
   * extension would silently see no tenant context.
   *
   * To make `run()` safe for that style -- rather than relying on every
   * call site remembering to `await` *inside* an async callback -- this
   * detects a thenable result and re-enters the store around awaiting it,
   * so the store is still bound at the moment the query actually runs.
   */
  run<T>(store: TenantStore, fn: () => T): T {
    return storage.run(store, () => {
      const result = fn();
      if (isThenable(result)) {
        return storage.run(store, async () => await result) as unknown as T;
      }
      return result;
    });
  },

  /** Returns the current tenant context, throwing if none is bound. */
  get(): TenantStore {
    const store = storage.getStore();
    if (!store) {
      throw new Error(
        "TenantContext.get() called with no tenant context bound. " +
          "Wrap this code path in TenantContext.run(...) -- there is no " +
          "implicit or default organization.",
      );
    }
    return store;
  },

  /** Returns the current tenant context, or null if none is bound. */
  getOrNull(): TenantStore | null {
    return storage.getStore() ?? null;
  },
};
