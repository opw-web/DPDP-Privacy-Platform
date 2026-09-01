"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantContext = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const storage = new node_async_hooks_1.AsyncLocalStorage();
/**
 * Thin wrapper around Node's AsyncLocalStorage carrying the current
 * tenant/actor for the lifetime of a request or background job.
 *
 * `TenantContext.get()` is the only way application code (and the Prisma
 * extension) learns the current organizationId -- it is never passed as a
 * function argument or read off a request object down in a service.
 */
function isThenable(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.then === "function");
}
exports.TenantContext = {
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
     *
     * THE RULE THIS RELIES ON: the thenable must be `fn`'s DIRECT return
     * value. `run(store, () => prisma.scoped.x.findMany())` is safe.
     * `run(store, () => ({ q: prisma.scoped.x.findMany() }))` is NOT --
     * `fn()` returns a plain object, not a thenable, so this detection never
     * fires, and the lazy query dispatches later with whatever context
     * happens to be active at that point (usually none, which fails closed
     * as a thrown "no tenant context" error -- but if that stored thenable
     * is later awaited inside a *different* tenant's `run()`, it silently
     * executes under org B's context instead of org A's). Never stash a
     * Prisma call in a container and await it outside the `run()` that
     * created it; call it and return/await it directly.
     */
    run(store, fn) {
        return storage.run(store, () => {
            const result = fn();
            if (isThenable(result)) {
                return storage.run(store, async () => await result);
            }
            return result;
        });
    },
    /** Returns the current tenant context, throwing if none is bound. */
    get() {
        const store = storage.getStore();
        if (!store) {
            throw new Error("TenantContext.get() called with no tenant context bound. " +
                "Wrap this code path in TenantContext.run(...) -- there is no " +
                "implicit or default organization.");
        }
        return store;
    },
    /** Returns the current tenant context, or null if none is bound. */
    getOrNull() {
        return storage.getStore() ?? null;
    },
};
//# sourceMappingURL=tenant-context.js.map