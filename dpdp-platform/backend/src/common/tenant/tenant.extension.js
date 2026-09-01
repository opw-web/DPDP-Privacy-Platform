"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantScopingExtension = void 0;
exports.primaryKeyWhereFor = primaryKeyWhereFor;
const client_1 = require("@prisma/client");
const tenant_context_1 = require("./tenant-context");
const tenant_scoped_models_1 = require("./tenant-scoped-models");
/**
 * Fix round 3 attempted, and reverted, two hardenings recorded here for
 * anyone re-reading this file's history:
 *
 *  - Requiring `$parent` (in `verifyIndirectForeignKey`) to carry a
 *    marker proving it is genuinely the client this extension built,
 *    before trusting it, instead of the current duck-typed "does it have
 *    this delegate" check. See that function's own comment for what was
 *    tried (both a plain property and a `client`-component method) and
 *    why both broke fix round 2's transaction-awareness fix instead of
 *    hardening it.
 *  - Replacing the `__fkAlreadyVerifiedOnTx` string marker (below) with a
 *    module-private Symbol, so a caller could not set the same key
 *    themselves via `createMany({ data, __fkAlreadyVerifiedOnTx: true }
 *    as any)` and skip the ownership check. This one broke silently
 *    rather than loudly: a Symbol-keyed property set on the `data` object
 *    passed to `this.createMany(...)` did not survive to
 *    `runScopedOperation`'s `createMany` case (Prisma's own argument
 *    handling appears to reconstruct the args object via a path that
 *    only preserves string keys somewhere before `$allOperations` sees
 *    it -- confirmed by running the transaction e2e test, which failed
 *    the same way as the `$parent` tag attempt above, for an unrelated
 *    reason). The string key remains; it is a real, if narrow, gap
 *    (typing is the only defence against a caller setting it themselves)
 *    but changing it was materially more invasive than "swap the key
 *    type" as originally scoped, so it was left as-is per the "if it
 *    turns out to be invasive, leave it and say so" instruction.
 */
const FK_ALREADY_VERIFIED_MARKER = "__fkAlreadyVerifiedOnTx";
const SCOPE_BY_MODEL = {
    ...Object.fromEntries(tenant_scoped_models_1.TENANT_SCOPED_MODELS.map((model) => [model, { kind: "direct" }])),
    ...Object.fromEntries(Object.entries(tenant_scoped_models_1.INDIRECT_TENANT_SCOPED_MODELS).map(([model, cfg]) => [
        model,
        { kind: "indirect", relations: cfg.relations },
    ])),
    ...Object.fromEntries(tenant_scoped_models_1.SELF_SCOPED_MODELS.map((model) => [model, { kind: "self" }])),
};
const ALL_SCOPED_MODEL_NAMES = [
    ...tenant_scoped_models_1.TENANT_SCOPED_MODELS,
    ...Object.keys(tenant_scoped_models_1.INDIRECT_TENANT_SCOPED_MODELS),
    ...tenant_scoped_models_1.SELF_SCOPED_MODELS,
];
function lowerFirst(name) {
    return name.charAt(0).toLowerCase() + name.slice(1);
}
/**
 * Every scoped model's primary key fields, derived from the live DMMF
 * (single `@id` field, or the `@@id([...])` tuple) rather than hand-listed
 * per model. Used by the `update` override to refetch the row it just
 * updated by an identifier that cannot itself have been changed by the
 * update -- see the "stale where" note on `buildModelOverrides` below.
 */
const PRIMARY_KEY_FIELDS = Object.fromEntries(client_1.Prisma.dmmf.datamodel.models.map((m) => {
    const singleId = m.fields.filter((f) => f.isId).map((f) => f.name);
    const fields = singleId.length > 0 ? singleId : (m.primaryKey?.fields ?? []);
    return [m.name, fields];
}));
/**
 * Maps modelName -> relationFieldName -> the RELATED model's name, derived
 * from the live DMMF. Needed because a relation's field name does not
 * always match its target model's client-delegate name -- `purpose` on
 * `DataSourcePurpose` points at `ProcessingPurpose`, whose delegate is
 * `processingPurpose`, not `purpose`. Fix round 1 caught this the hard
 * way: assuming `getScopedClient()[relation]` worked for every relation
 * name silently no-op'd the ownership check for `purposeId` (it threw
 * "Cannot read properties of undefined", which the tests surfaced
 * immediately -- but a subtler mismatch could just as easily have skipped
 * the check instead of erroring).
 */
const RELATION_TARGET_MODEL = Object.fromEntries(client_1.Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    Object.fromEntries(m.fields
        .filter((f) => f.kind === "object" && f.relationName)
        .map((f) => [f.name, f.type])),
]));
/**
 * Fix round 3 -- rated the highest-value follow-up in this file: without
 * this guard, a primary-key field resolving to `undefined` produces
 * exactly the shape of the round-2 mass-delete Critical (`{ id: undefined }`
 * collapses a predicate to "no filter on that field" in Prisma). This
 * matters today in the indirect-model `create` override, which builds
 * `pkWhere` from `args.data` -- caller input, not a fetched row -- and is
 * only safe because both current indirect models' primary keys are
 * exactly the FK columns the caller must supply. An indirect model added
 * later with an autogenerated `id` PK would otherwise silently produce
 * `{ id: undefined }` there, and the following `findFirstOrThrow` would
 * return an arbitrary row from the current org as the "created" object.
 * Throwing here forecloses that failure at every call site permanently,
 * not just the one this task happened to catch.
 */
function primaryKeyWhereFor(modelName, row) {
    const fields = PRIMARY_KEY_FIELDS[modelName] ?? [];
    if (fields.length === 0) {
        throw new Error(`tenant.extension.ts: primaryKeyWhereFor() found no primary-key ` +
            `fields for model '${modelName}' -- check the Prisma schema and ` +
            "PRIMARY_KEY_FIELDS.");
    }
    const where = {};
    for (const field of fields) {
        const value = row[field];
        if (value === undefined) {
            throw new Error(`tenant.extension.ts: primaryKeyWhereFor() got undefined for ` +
                `primary-key field '${field}' on model '${modelName}' -- an ` +
                "undefined field is dropped from a Prisma where clause " +
                "entirely, which would silently widen this query instead of " +
                "targeting one row. Refusing to build a where clause that could " +
                "do that.");
        }
        where[field] = value;
    }
    return where;
}
/**
 * Builds the `{ organizationId }` / `{ id }` /
 * `{ AND: [{ <relation1>: { organizationId } }, ...] }` filter. An
 * indirect model ANDs every listed relation, not just one -- a stricter
 * (never looser) filter than using a single relation, and correct even if
 * a row somehow existed with inconsistent parent organizations.
 */
function tenantFilterFor(scope, organizationId) {
    if (scope.kind === "direct") {
        return { organizationId };
    }
    if (scope.kind === "self") {
        return { id: organizationId };
    }
    if (scope.relations.length === 1) {
        return { [scope.relations[0]]: { organizationId } };
    }
    return {
        AND: scope.relations.map((relation) => ({
            [relation]: { organizationId },
        })),
    };
}
/** AND-wraps an existing `where` with the injected tenant filter. */
function mergeWhere(where, filter) {
    if (where === undefined ||
        where === null ||
        Object.keys(where).length === 0) {
        return filter;
    }
    return { AND: [where, filter] };
}
/**
 * Prisma's WhereUniqueInput for a compound key looks like
 * `{ organizationId_reference: { organizationId, reference } }`; for a
 * single scalar unique field it looks like `{ id: "..." }`. This flattens
 * either shape into a plain filter object usable by findFirst/updateMany/
 * deleteMany, which is what lets findUnique/update/delete degrade to
 * their *Many/findFirst equivalents without losing any of the caller's
 * selector.
 */
function flattenUniqueWhere(where) {
    const flat = {};
    if (!where)
        return flat;
    for (const [key, value] of Object.entries(where)) {
        if (value !== null &&
            typeof value === "object" &&
            !(value instanceof Date) &&
            !Array.isArray(value) &&
            !Buffer.isBuffer(value)) {
            Object.assign(flat, value);
        }
        else {
            flat[key] = value;
        }
    }
    return flat;
}
/** Removes a caller-supplied `organizationId` from a write payload -- a row's tenant never moves via update. */
function stripOrganizationId(data) {
    if (data && typeof data === "object" && "organizationId" in data) {
        const clone = { ...data };
        delete clone["organizationId"];
        return clone;
    }
    return data;
}
function notFoundError(modelName) {
    return new client_1.Prisma.PrismaClientKnownRequestError(`No '${modelName}' record was found for the given tenant-scoped where clause.`, { code: "P2025", clientVersion: client_1.Prisma.prismaVersion.client });
}
function organizationCreateBlockedError(operation) {
    return new Error(`Organization.${operation}() is not available on the tenant-scoped client. ` +
        "An organization is created at signup, before any tenant context " +
        "exists to scope it to -- use the raw PrismaService (never `.scoped`) " +
        "for that write.");
}
/**
 * Create-time defence for the indirect join-table models (`RolePermission`,
 * `DataSourcePurpose`): their only tenant signal is a foreign key to a
 * scoped parent (`roleId` -> Role, `dataSourceId` -> DataSource), and
 * Prisma gives an extension no `where` to inject on create. Rather than
 * trust that foreign id, resolve it through the SCOPED parent delegate --
 * `getScopedClient()`, not the raw client -- so a foreign id belonging to
 * another organization fails here with P2025 instead of silently
 * attaching a cross-tenant grant/purpose. This only covers the
 * flat-scalar-FK shape (`{ roleId: "..." }`); a nested `connect` bypasses
 * it entirely -- see the CONTRACT BOUNDARY note at the top of this file.
 *
 * $TRANSACTION AND THE INDIRECT FK CHECK (task 3 review, fix round 2,
 * Important) -- read this before changing `getScopedClient`:
 *
 * `getScopedClient` here is the CLOSURE-CAPTURED, TOP-LEVEL extended
 * client (see `tenantScopingExtension` at the bottom of this file) --
 * fixed once, at `$extends()` time. When this function is reached from
 * the `createMany` case in `runScopedOperation` (i.e. a direct, top-level
 * `prisma.scoped.rolePermission.createMany(...)` call, or the app calling
 * `createMany` for an indirect model at all), that is correct: there is
 * no enclosing transaction to worry about.
 *
 * But when the ORIGINAL call was `create` (singular) on an indirect model
 * and it happened INSIDE an interactive transaction --
 * `prisma.scoped.$transaction(async (tx) => { await tx.role.create(...);
 * await tx.rolePermission.create({ data: { roleId: <the role just
 * created>, permissionCode } }); })` -- using this same top-level client
 * for the ownership check would run the verification SELECT on a
 * different connection than `tx`, which cannot see the just-created,
 * not-yet-committed `Role` row: a spurious P2025 for a perfectly valid
 * write. Confirmed empirically (a throwaway probe script, not just
 * reasoning): `Prisma.getExtensionContext(this).$parent` inside a
 * MODEL-component method correctly differs between a top-level call and a
 * `tx`-bound call, so for `create` specifically (see the `create`
 * override in `buildModelOverrides`), the check runs against
 * `getExtensionContext(this).$parent` -- the ACTUAL acting client for
 * that invocation, `tx` when inside one -- not this closure.
 *
 * `createMany` (multi-row, called directly by the app rather than
 * internally by `create`) could NOT be given the same fix: `.$extends()`
 * is explicitly denylisted on an interactive-transaction client (Prisma's
 * `ITXClientDenyList`), and a model-component override of `createMany`
 * has no non-recursive way to reach the real underlying `createMany`
 * (unlike `create`, which can bottom out via the *different* operation
 * name `createMany` -- there is no third name for `createMany` itself to
 * fall back to). A `createMany` on an indirect model INSIDE a
 * transaction, referencing a parent written earlier in that SAME
 * transaction, therefore still uses this top-level client and can still
 * throw a spurious P2025. Prefer looping single `create` calls over
 * `createMany` for indirect models inside a transaction until/unless
 * Prisma's extension API grows a way to reach the transactional client
 * from a query-component callback (it does not have one today: verified
 * empirically that `$allOperations`'s `query` continuation carries no
 * accessible reference to it).
 */
async function verifyIndirectForeignKey(modelName, scope, data, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
getActingClient, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
getFallbackClient) {
    // Every listed relation gets checked, not just the first -- see the
    // DataSourcePurpose comment on INDIRECT_TENANT_SCOPED_MODELS for why a
    // single-relation check silently missed a second foreign key.
    await Promise.all(scope.relations.map(async (relation) => {
        const fkField = `${relation}Id`;
        const fkValue = data?.[fkField];
        if (typeof fkValue !== "string") {
            // No flat scalar FK to check (e.g. a nested `connect`) -- outside
            // what this check can verify. See the CONTRACT BOUNDARY note above.
            return;
        }
        const targetModel = RELATION_TARGET_MODEL[modelName]?.[relation];
        if (!targetModel) {
            throw new Error(`tenant.extension.ts: no relation '${relation}' found on model ` +
                `'${modelName}' in the Prisma schema -- check ` +
                "INDIRECT_TENANT_SCOPED_MODELS.");
        }
        const delegateName = lowerFirst(targetModel);
        // `getActingClient()` is `$parent` from the calling model context --
        // the correct, transaction-bound client when we are inside one. But
        // see the SUBCLASSED CLIENT CAVEAT note above `verifyIndirectForeignKey`'s
        // call site: for a NON-transactional top-level call on
        // `PrismaService.scoped` specifically, `$parent` comes back as a
        // reduced object with no model delegates at all (confirmed
        // empirically), so `delegateName` is looked up there first and, if
        // absent, `getFallbackClient()` (the closure-captured top-level
        // extended client, always fully formed) is used instead. There is
        // no transaction to worry about missing in that case, so the
        // fallback is exactly as correct as fix round 1's original
        // (non-tx-aware) check was.
        //
        // FIX ROUND 3 ATTEMPTED AND REVERTED A STRICTER VERSION OF THIS:
        // requiring `$parent` to carry a marker proving it is genuinely the
        // client this extension built (tried both as a plain property
        // poked onto `extended` after `$extends()` returns, and as a
        // method added through the extension's own `client` component --
        // the more "official" of the two mechanisms), falling back to
        // `getFallbackClient()` otherwise. BOTH were confirmed, by running
        // the actual "create for a Role seeded earlier in the SAME
        // interactive transaction" e2e test, to break fix round 2's
        // transaction-awareness fix: `$parent` inside a real interactive
        // transaction on `PrismaService.scoped` is fully functional (its
        // `.role.findFirstOrThrow` correctly applies tenant scoping AND
        // transaction visibility -- proven by round 2's passing tests) but
        // does NOT carry through either kind of marker this file tried to
        // attach, so requiring one made every call -- including the
        // legitimate in-transaction case -- fall back to the
        // non-transactional client, reintroducing the exact spurious P2025
        // fix round 2 exists to prevent. No further mechanism was found, in
        // the time available, to positively prove "is this really our
        // client" without relying on Prisma internals beyond what its
        // extension API documents. The duck-typed check below (does this
        // object have this delegate at all) is what remains; it is
        // materially weaker than an identity check, and is recorded here as
        // a known open question rather than silently left unremarked.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const acting = getActingClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const delegate = (acting?.[delegateName] ??
            getFallbackClient()[delegateName]);
        await delegate.findFirstOrThrow({
            where: { id: fkValue },
        });
    }));
}
/**
 * Handles every Prisma operation reaching a scoped model. Unlike a plain
 * "transform the args" helper, this calls `query(...)` (or throws) itself,
 * because the indirect-model create check and the self-scoped create
 * block need to run -- and potentially short-circuit -- before the
 * underlying query executes.
 */
async function runScopedOperation(model, operation, rawArgs, query, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
getScopedClient) {
    const scope = SCOPE_BY_MODEL[model];
    if (!scope) {
        // Permission, or anything not yet registered: pass through untouched.
        // (A new model with an organizationId column that is missing from
        // TENANT_SCOPED_MODELS also falls into this branch -- caught by
        // tenant-scoped-models.spec.ts, not by this function.)
        return query(rawArgs);
    }
    const { organizationId } = tenant_context_1.TenantContext.get();
    const filter = tenantFilterFor(scope, organizationId);
    const args = (rawArgs ?? {});
    switch (operation) {
        case "findFirst":
        case "findFirstOrThrow":
        case "findMany":
        case "count":
        case "aggregate":
        case "groupBy":
        case "delete":
        case "update":
        case "upsert": {
            return query({ ...args, where: mergeWhere(args.where, filter) });
        }
        case "updateMany": {
            return query({
                ...args,
                where: mergeWhere(args.where, filter),
                data: stripOrganizationId(args.data),
            });
        }
        case "deleteMany": {
            return query({ ...args, where: mergeWhere(args.where, filter) });
        }
        case "create": {
            if (scope.kind === "self") {
                throw organizationCreateBlockedError("create");
            }
            if (scope.kind === "indirect") {
                // Query component: no `this`/model context available here (see
                // the $TRANSACTION AND THE INDIRECT FK CHECK note above
                // `verifyIndirectForeignKey`), so acting and fallback are the
                // same closure-captured top-level client. This path is only
                // reached for a top-level `prisma.scoped.<model>.create(...)`
                // call anyway -- `buildModelOverrides` gives indirect models
                // their own tx-aware `create` override that never falls through
                // to here.
                await verifyIndirectForeignKey(model, scope, args.data, getScopedClient, getScopedClient);
                return query(args);
            }
            return query({
                ...args,
                data: { ...args.data, organizationId },
            });
        }
        case "createMany": {
            if (scope.kind === "self") {
                throw organizationCreateBlockedError("createMany");
            }
            const rows = Array.isArray(args.data) ? args.data : [args.data];
            if (scope.kind === "indirect") {
                if (args[FK_ALREADY_VERIFIED_MARKER]) {
                    // Set only by the tx-aware `create` override below, which has
                    // already verified ownership via the CORRECT (possibly
                    // transaction-bound) acting client. Re-verifying here would use
                    // the top-level, non-transactional client (see the
                    // $TRANSACTION AND THE INDIRECT FK CHECK note above create's
                    // override) and could wrongly reject a row that a concurrent
                    // step of the SAME transaction already wrote but not committed.
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { [FK_ALREADY_VERIFIED_MARKER]: _marker, ...rest } = args;
                    return query(rest);
                }
                await Promise.all(rows.map((row) => verifyIndirectForeignKey(model, scope, row, getScopedClient, getScopedClient)));
                return query(args);
            }
            return query({
                ...args,
                data: rows.map((row) => ({
                    ...row,
                    organizationId,
                })),
            });
        }
        default:
            return query(args);
    }
}
/**
 * Builds the `model` extension component: for every scoped model (direct,
 * indirect and self), replaces findUnique/findUniqueOrThrow/update/
 * delete/upsert with implementations built on findFirst(OrThrow)/
 * updateMany/deleteMany/create, so the tenant filter (applied by the query
 * component above, on those underlying operations) can never be bypassed.
 *
 * IMPORTANT -- $transaction compatibility (task 3 review, Important 5),
 * determined empirically, not assumed: these five overridden methods are
 * plain `async function`s, not Prisma's lazy, specially-branded
 * `PrismaPromise`. Two consequences, confirmed against the real client:
 *
 *   1. The INTERACTIVE `$transaction` form works fine:
 *      `prisma.scoped.$transaction(async (tx) => tx.model.update(...))`.
 *
 *   2. The ARRAY form does NOT:
 *      `prisma.scoped.$transaction([prisma.scoped.model.update(...)])`
 *      throws "All elements of the array need to be Prisma Client
 *      promises." findUnique/findUniqueOrThrow/update/delete/upsert on any
 *      scoped model cannot go in that array. (findMany/findFirst/count/
 *      etc. -- the ones NOT overridden here -- are still genuine
 *      PrismaPromises and work fine in the array form.)
 *
 *   3. Sharper trap: because these overrides are plain async functions,
 *      calling one EXECUTES IT IMMEDIATELY -- there is no lazy, "prepared
 *      but not yet run" state the way `const op = prisma.model.findMany()`
 *      has for a real PrismaPromise. `const op = prisma.scoped.model.update(...)`
 *      has already started the write before you decide what to do with
 *      `op`, whether or not you ever await it or pass it to `$transaction`.
 *
 * Later tasks needing an atomic multi-step write across models (Task 4's
 * AuditService, Task 18's sync job, named explicitly in the review) MUST
 * use the interactive `$transaction` form, and must call these methods
 * directly inside that callback, not pre-build them as pending operations.
 */
function buildModelOverrides(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
getScopedClient) {
    const overrides = {};
    for (const modelName of ALL_SCOPED_MODEL_NAMES) {
        const key = lowerFirst(modelName);
        const scope = SCOPE_BY_MODEL[modelName];
        overrides[key] = {
            // Only added for indirect models (RolePermission, DataSourcePurpose).
            // See the $TRANSACTION AND THE INDIRECT FK CHECK note above
            // `verifyIndirectForeignKey` for why `create` gets this special
            // handling and `createMany` does not.
            ...(scope?.kind === "indirect"
                ? {
                    async create(args) {
                        // `this` is bound to whatever client the call was actually
                        // made through -- the top-level scoped client, or `tx` when
                        // called as `tx.<model>.create(...)` inside an interactive
                        // transaction. `$parent` resolves to that SAME acting
                        // client, so the ownership check below runs on `tx` (and
                        // therefore sees rows written earlier in that same
                        // transaction) instead of a separate, non-transactional
                        // connection.
                        //
                        // SUBCLASSED CLIENT CAVEAT, found while testing this fix:
                        // confirmed empirically that `$parent` behaves correctly
                        // (full client, with every model delegate) for a plain
                        // `new PrismaClient().$extends(...)`, in BOTH the
                        // top-level and transactional case. But `PrismaService`
                        // (this codebase's actual base client) EXTENDS
                        // `PrismaClient` as a subclass, and against
                        // `PrismaService.scoped`, `$parent` for a TOP-LEVEL
                        // (non-transactional) call comes back as a reduced object
                        // with no model delegates at all -- while, oddly,
                        // `$parent` for a call made as `tx.<model>.create(...)`
                        // INSIDE an interactive transaction on that same
                        // `PrismaService.scoped` client is fully formed and
                        // correctly transaction-bound. `verifyIndirectForeignKey`
                        // therefore tries `$parent` first and falls back to the
                        // closure-captured top-level client (`getScopedClient`)
                        // only when `$parent` lacks the needed delegate -- which,
                        // per the above, is exactly the case where there is no
                        // transaction to be tx-aware about anyway.
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const actingClient = client_1.Prisma.getExtensionContext(this)
                            .$parent;
                        await verifyIndirectForeignKey(modelName, scope, args.data, () => actingClient, getScopedClient);
                        // Bottom out via `createMany` -- a DIFFERENT operation name,
                        // not overridden here -- so this reaches the real insert via
                        // the query component instead of recursing into this same
                        // override. The marker tells that component's `createMany`
                        // case the ownership check already ran (correctly, on the
                        // acting client above); skipping it there avoids re-running
                        // it on the wrong (top-level, non-transactional) client.
                        await this.createMany({
                            data: [args.data],
                            [FK_ALREADY_VERIFIED_MARKER]: true,
                        });
                        const pkWhere = primaryKeyWhereFor(modelName, args.data);
                        return this.findFirstOrThrow({
                            where: pkWhere,
                            select: args["select"],
                            include: args["include"],
                        });
                    },
                }
                : {}),
            async findUnique(args) {
                const where = flattenUniqueWhere(args.where);
                return this.findFirst({ ...args, where });
            },
            async findUniqueOrThrow(args) {
                const where = flattenUniqueWhere(args.where);
                return this.findFirstOrThrow({ ...args, where });
            },
            // NB: not atomic with the updateMany below it (two round trips). If
            // a later task needs update-then-return to be all-or-nothing, wrap
            // this in a $transaction -- documented here rather than fixed,
            // because closing it isn't required for anything currently in this
            // codebase (see task 3 fix-round-1 report, Important 6/upsert note
            // for the parallel ruling on upsert).
            async update(args) {
                const where = flattenUniqueWhere(args.where);
                // Deliberately NOT `{ where, select: args["select"], include: args["include"] }`
                // here -- checked specifically after the same bug was found in
                // `delete` (fix round 2 / Critical): passing the caller's
                // projection into THIS lookup would risk the identical failure
                // (a `select` omitting the primary key producing an
                // all-fields-undefined `pkWhere`, collapsing `updateMany` below to
                // "every row in this org"). This lookup stays projection-free on
                // purpose; the caller's select/include is applied only to the
                // final `findFirstOrThrow` return below, never to a lookup that
                // feeds `primaryKeyWhereFor`.
                const existing = await this.findFirst({ where });
                if (!existing) {
                    throw notFoundError(modelName);
                }
                // Refetch by the row's PRIMARY key, captured from `existing`
                // BEFORE the update -- never by the original (possibly now-stale)
                // `where`. `data` can change exactly the field(s) a non-PK unique
                // selector like `{ organizationId, reference }` matched on; a
                // refetch using that same selector after the row's `reference`
                // has changed would find nothing and throw P2025 for an update
                // that had already committed. The primary key (from DMMF, so this
                // holds for compound keys like RolePermission's too) cannot be
                // touched by an ordinary update, so it stays a valid selector.
                const pkWhere = primaryKeyWhereFor(modelName, existing);
                const { count } = await this.updateMany({
                    where: pkWhere,
                    data: args.data,
                });
                if (count === 0) {
                    // count === 0 here is ambiguous, NOT necessarily the row being
                    // deleted mid-request: an all-`undefined` `args.data` (an
                    // all-optional PATCH DTO with an empty/no-op body) makes
                    // `updateMany` a no-op, and Prisma reports that no-op as
                    // `count: 0` on a row that demonstrably still exists -- the
                    // `findFirst` above just found it. Disambiguate by re-reading
                    // on the same projection-free `pkWhere`: if the row is still
                    // there, this was a no-op update and we fall through to the
                    // normal return below; only a genuinely missing row (deleted
                    // between the findFirst above and the updateMany) throws.
                    const stillThere = await this.findFirst({ where: pkWhere });
                    if (!stillThere) {
                        throw notFoundError(modelName);
                    }
                }
                return this.findFirstOrThrow({
                    where: pkWhere,
                    select: args["select"],
                    include: args["include"],
                });
            },
            async delete(args) {
                const where = flattenUniqueWhere(args.where);
                // Fix round 2 / Critical: the primary-key lookup used to fetch
                // (and derive pkWhere from) the row using the CALLER's
                // select/include. A `select` that omits the primary key (e.g.
                // `select: { displayName: true }`) meant `primaryKeyWhereFor`
                // built `{ id: undefined }` -- Prisma treats an `undefined` field
                // as ABSENT, so the deleteMany below collapsed to just the tenant
                // filter and silently deleted every row of the model for the
                // current organization. This lookup is now always
                // projection-free, so pkWhere is always built from real values;
                // the caller's select/include is applied separately, only to
                // shape the RETURNED object.
                const pkRow = await this.findFirst({ where });
                if (!pkRow) {
                    throw notFoundError(modelName);
                }
                const pkWhere = primaryKeyWhereFor(modelName, pkRow);
                const existing = args["select"] || args["include"]
                    ? await this.findFirst({
                        where: pkWhere,
                        select: args["select"],
                        include: args["include"],
                    })
                    : pkRow;
                if (!existing) {
                    // Race: the row was deleted between the two lookups above.
                    throw notFoundError(modelName);
                }
                await this.deleteMany({ where: pkWhere });
                return existing;
            },
            // NB: findFirst-then-branch is NOT atomic -- two concurrent callers
            // can both take the create branch and collide on a unique
            // constraint. Left this way deliberately: the one model where this
            // would matter (`Counter`) is taken with `SELECT ... FOR UPDATE`
            // inside the caller's own transaction per spec (task 4's
            // AuditService), via raw SQL, and does not go through this upsert
            // at all. Do not assume this upsert is safe under concurrency for
            // anything else without adding real atomicity first.
            async upsert(args) {
                const where = flattenUniqueWhere(args.where);
                const existing = await this.findFirst({ where });
                if (existing) {
                    return this.update({
                        where: args.where,
                        data: args["update"],
                        select: args["select"],
                        include: args["include"],
                    });
                }
                return this.create({
                    data: args["create"],
                    select: args["select"],
                    include: args["include"],
                });
            },
        };
    }
    return overrides;
}
/**
 * `tenantScopingExtension` is built via the function form of
 * `Prisma.defineExtension` purely to capture a reference to the fully
 * extended client (`extended`, closed over by `getScopedClient` below)
 * once `$extends` returns -- this is what lets the indirect-model
 * create-time foreign-key check call `role.findFirstOrThrow`/
 * `dataSource.findFirstOrThrow` through the SAME tenant-scoped delegate
 * as everything else, instead of needing its own hand-written
 * `organizationId` filter. `extended` is assigned synchronously, before
 * any application code can have started a query against it, so
 * `getScopedClient()` is never called before it is set.
 */
exports.tenantScopingExtension = client_1.Prisma.defineExtension((client) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
    const extended = client.$extends({
        name: "tenant-scoping",
        // buildModelOverrides() returns a dynamically-keyed object (one entry
        // per scoped model, computed from TENANT_SCOPED_MODELS /
        // INDIRECT_TENANT_SCOPED_MODELS / SELF_SCOPED_MODELS) rather than a
        // literal object typed against Prisma's generated per-model extension
        // shape, so it is cast here rather than fought into the exact generic
        // Prisma expects.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: buildModelOverrides(() => extended),
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    return runScopedOperation(model, operation, args, query, () => extended);
                },
            },
        },
    });
    return extended;
});
//# sourceMappingURL=tenant.extension.js.map