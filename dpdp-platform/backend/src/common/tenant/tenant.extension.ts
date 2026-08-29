import { Prisma } from "@prisma/client";
import { TenantContext } from "./tenant-context";
import {
  INDIRECT_TENANT_SCOPED_MODELS,
  SELF_SCOPED_MODELS,
  TENANT_SCOPED_MODELS,
} from "./tenant-scoped-models";

/**
 * Tenant-isolation Prisma client extension.
 *
 * This is the ONLY place `organizationId` is ever written into a Prisma
 * `where` or `data` object. No service anywhere in this codebase passes
 * `organizationId` manually -- if a service needs to, this extension has a
 * gap, and the fix belongs here, never in the service.
 *
 * Three mechanisms compose to cover all 13 Prisma operations named in the
 * task brief:
 *
 *  1. A `query` component (`$allModels.$allOperations`) that injects the
 *     tenant filter into `where` (read/update/delete-many ops), forces
 *     `organizationId` in `data` (create ops on direct models), verifies a
 *     caller-supplied foreign id through the scoped parent delegate
 *     (create ops on indirect join-table models), or blocks the operation
 *     outright (create ops on the self-scoped `Organization` model). This
 *     covers findFirst(OrThrow), findMany, count, aggregate, groupBy,
 *     updateMany, deleteMany, create and createMany directly.
 *
 *  2. A `model` component that replaces findUnique, findUniqueOrThrow,
 *     update, delete and upsert on each scoped model with an
 *     implementation built from the ops in (1). This is what makes the
 *     degrade-to-findFirst behaviour work: Prisma's typed `where` for
 *     these operations is a WhereUniqueInput (e.g. `{ id }` or
 *     `{ tokenHash }`), which cannot carry an extra `organizationId`
 *     filter without dropping to a non-unique query -- so instead of
 *     calling the underlying findUnique/update/delete at all, we flatten
 *     the unique selector into a plain filter object and re-issue it as
 *     findFirst/updateMany/deleteMany, which DO go back through (1) and
 *     get the tenant filter applied. A direct fetch of another org's row
 *     by id therefore returns null/P2025 (404 territory), never a 403 --
 *     from the extension's point of view the row simply does not exist.
 *
 *  3. A closure-captured reference to the fully extended client itself
 *     (`getScopedClient()`), used only by the create-time foreign-key
 *     check for indirect models (see `verifyIndirectForeignKey`) so that
 *     checking "does this roleId/dataSourceId belong to my org" goes
 *     through the SAME tenant-scoped delegate as everything else --
 *     nobody, including this extension, ever hand-writes an
 *     `organizationId` filter for that check.
 *
 * ============================================================================
 * CONTRACT BOUNDARY -- read this before writing a service that touches a
 * scoped model with a relation (nested writes/reads, `connect`, `include`).
 * ============================================================================
 * Prisma extensions cannot intercept what happens *inside* a nested
 * write or a nested read: `include`/`select` sub-reads carry no filter,
 * and `connect` / `connectOrCreate` / a raw foreign-key scalar buried
 * inside a `create` payload are not validated for tenant ownership by
 * anything in this file. Concretely:
 *
 *   prisma.scoped.identityLink.create({
 *     data: { organizationId: <ignored, forced to ctx>, dataPrincipal: { connect: { id: <ANY org's id> } } },
 *   })
 *
 * creates an Acme-stamped row pointing at whatever `id` was given, even a
 * Globex principal's -- and a later
 * `prisma.scoped.identityLink.findMany({ include: { dataPrincipal: true } })`
 * will happily return that Globex principal through the scoped client,
 * because `include` performs its own, unfiltered fetch. This is a genuine
 * limitation of what a Prisma client extension can intercept, not an
 * oversight left for a later fix.
 *
 * THE RULE, enforced by contract rather than code: any service accepting a
 * caller-supplied foreign id for a scoped relation MUST resolve that id
 * through the SCOPED delegate before using it in a write or relying on it
 * in a read -- e.g.
 *
 *   const principal = await prisma.scoped.dataPrincipal.findUniqueOrThrow({
 *     where: { id: candidateId },
 *   });
 *   // principal.organizationId === current tenant, or this line already
 *   // threw P2025 -- only NOW is candidateId safe to use in a `connect`
 *   // or a raw FK scalar.
 *
 * This is exactly the same idiom already used for the indirect join
 * tables' create-time check below (mechanism 3) -- it is not a new
 * pattern invented for services, it is this file's own pattern, handed
 * outward because Prisma gives us no other lever here.
 * ============================================================================
 */

type ScopeConfig =
  | { kind: "direct" }
  | { kind: "indirect"; relations: readonly string[] }
  | { kind: "self" };

const SCOPE_BY_MODEL: Readonly<Record<string, ScopeConfig>> = {
  ...Object.fromEntries(
    TENANT_SCOPED_MODELS.map((model) => [model, { kind: "direct" as const }]),
  ),
  ...Object.fromEntries(
    Object.entries(INDIRECT_TENANT_SCOPED_MODELS).map(([model, cfg]) => [
      model,
      { kind: "indirect" as const, relations: cfg.relations },
    ]),
  ),
  ...Object.fromEntries(
    SELF_SCOPED_MODELS.map((model) => [model, { kind: "self" as const }]),
  ),
};

const ALL_SCOPED_MODEL_NAMES: readonly string[] = [
  ...TENANT_SCOPED_MODELS,
  ...Object.keys(INDIRECT_TENANT_SCOPED_MODELS),
  ...SELF_SCOPED_MODELS,
];

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Every scoped model's primary key fields, derived from the live DMMF
 * (single `@id` field, or the `@@id([...])` tuple) rather than hand-listed
 * per model. Used by the `update` override to refetch the row it just
 * updated by an identifier that cannot itself have been changed by the
 * update -- see the "stale where" note on `buildModelOverrides` below.
 */
const PRIMARY_KEY_FIELDS: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(
    Prisma.dmmf.datamodel.models.map((m) => {
      const singleId = m.fields.filter((f) => f.isId).map((f) => f.name);
      const fields =
        singleId.length > 0 ? singleId : (m.primaryKey?.fields ?? []);
      return [m.name, fields];
    }),
  );

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
const RELATION_TARGET_MODEL: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.fromEntries(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    Object.fromEntries(
      m.fields
        .filter((f) => f.kind === "object" && f.relationName)
        .map((f) => [f.name, f.type]),
    ),
  ]),
);

function primaryKeyWhereFor(
  modelName: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const fields = PRIMARY_KEY_FIELDS[modelName] ?? [];
  const where: Record<string, unknown> = {};
  for (const field of fields) {
    where[field] = row[field];
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
function tenantFilterFor(
  scope: ScopeConfig,
  organizationId: string,
): Record<string, unknown> {
  if (scope.kind === "direct") {
    return { organizationId };
  }
  if (scope.kind === "self") {
    return { id: organizationId };
  }
  if (scope.relations.length === 1) {
    return { [scope.relations[0] as string]: { organizationId } };
  }
  return {
    AND: scope.relations.map((relation) => ({
      [relation]: { organizationId },
    })),
  };
}

/** AND-wraps an existing `where` with the injected tenant filter. */
function mergeWhere(
  where: unknown,
  filter: Record<string, unknown>,
): Record<string, unknown> {
  if (
    where === undefined ||
    where === null ||
    Object.keys(where as object).length === 0
  ) {
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
function flattenUniqueWhere(
  where: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  if (!where) return flat;
  for (const [key, value] of Object.entries(where)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      !Buffer.isBuffer(value)
    ) {
      Object.assign(flat, value as Record<string, unknown>);
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

/** Removes a caller-supplied `organizationId` from a write payload -- a row's tenant never moves via update. */
function stripOrganizationId<T>(data: T): T {
  if (data && typeof data === "object" && "organizationId" in data) {
    const clone = { ...(data as Record<string, unknown>) };
    delete clone["organizationId"];
    return clone as T;
  }
  return data;
}

function notFoundError(
  modelName: string,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `No '${modelName}' record was found for the given tenant-scoped where clause.`,
    { code: "P2025", clientVersion: Prisma.prismaVersion.client },
  );
}

function organizationCreateBlockedError(operation: string): Error {
  return new Error(
    `Organization.${operation}() is not available on the tenant-scoped client. ` +
      "An organization is created at signup, before any tenant context " +
      "exists to scope it to -- use the raw PrismaService (never `.scoped`) " +
      "for that write.",
  );
}

/**
 * Create-time defence for the indirect join-table models (`RolePermission`,
 * `DataSourcePurpose`): their only tenant signal is a foreign key to a
 * scoped parent (`roleId` -> Role, `dataSourceId` -> DataSource), and
 * Prisma gives an extension no `where` to inject on create. Rather than
 * trust that foreign id, resolve it through the SCOPED parent delegate --
 * `getScopedClient()[relation]`, not the raw client -- so a foreign id
 * belonging to another organization fails here with P2025 instead of
 * silently attaching a cross-tenant grant/purpose. This only covers the
 * flat-scalar-FK shape (`{ roleId: "..." }`); a nested `connect` bypasses
 * it entirely -- see the CONTRACT BOUNDARY note at the top of this file.
 */
async function verifyIndirectForeignKey(
  modelName: string,
  scope: { kind: "indirect"; relations: readonly string[] },
  data: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getScopedClient: () => any,
): Promise<void> {
  // Every listed relation gets checked, not just the first -- see the
  // DataSourcePurpose comment on INDIRECT_TENANT_SCOPED_MODELS for why a
  // single-relation check silently missed a second foreign key.
  await Promise.all(
    scope.relations.map(async (relation) => {
      const fkField = `${relation}Id`;
      const fkValue = (data as Record<string, unknown> | undefined)?.[fkField];
      if (typeof fkValue !== "string") {
        // No flat scalar FK to check (e.g. a nested `connect`) -- outside
        // what this check can verify. See the CONTRACT BOUNDARY note above.
        return;
      }
      const targetModel = RELATION_TARGET_MODEL[modelName]?.[relation];
      if (!targetModel) {
        throw new Error(
          `tenant.extension.ts: no relation '${relation}' found on model ` +
            `'${modelName}' in the Prisma schema -- check ` +
            "INDIRECT_TENANT_SCOPED_MODELS.",
        );
      }
      const delegateName = lowerFirst(targetModel);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (getScopedClient()[delegateName] as any).findFirstOrThrow({
        where: { id: fkValue },
      });
    }),
  );
}

interface OperationArgs {
  where?: unknown;
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Handles every Prisma operation reaching a scoped model. Unlike a plain
 * "transform the args" helper, this calls `query(...)` (or throws) itself,
 * because the indirect-model create check and the self-scoped create
 * block need to run -- and potentially short-circuit -- before the
 * underlying query executes.
 */
async function runScopedOperation(
  model: string,
  operation: string,
  rawArgs: unknown,
  query: (args: never) => Promise<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getScopedClient: () => any,
): Promise<unknown> {
  const scope = SCOPE_BY_MODEL[model];
  if (!scope) {
    // Permission, or anything not yet registered: pass through untouched.
    // (A new model with an organizationId column that is missing from
    // TENANT_SCOPED_MODELS also falls into this branch -- caught by
    // tenant-scoped-models.spec.ts, not by this function.)
    return query(rawArgs as never);
  }

  const { organizationId } = TenantContext.get();
  const filter = tenantFilterFor(scope, organizationId);
  const args = (rawArgs ?? {}) as OperationArgs;

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
      return query({ ...args, where: mergeWhere(args.where, filter) } as never);
    }
    case "updateMany": {
      return query({
        ...args,
        where: mergeWhere(args.where, filter),
        data: stripOrganizationId(args.data),
      } as never);
    }
    case "deleteMany": {
      return query({ ...args, where: mergeWhere(args.where, filter) } as never);
    }
    case "create": {
      if (scope.kind === "self") {
        throw organizationCreateBlockedError("create");
      }
      if (scope.kind === "indirect") {
        await verifyIndirectForeignKey(
          model,
          scope,
          args.data,
          getScopedClient,
        );
        return query(args as never);
      }
      return query({
        ...args,
        data: { ...(args.data as Record<string, unknown>), organizationId },
      } as never);
    }
    case "createMany": {
      if (scope.kind === "self") {
        throw organizationCreateBlockedError("createMany");
      }
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      if (scope.kind === "indirect") {
        await Promise.all(
          rows.map((row: unknown) =>
            verifyIndirectForeignKey(model, scope, row, getScopedClient),
          ),
        );
        return query(args as never);
      }
      return query({
        ...args,
        data: rows.map((row: Record<string, unknown>) => ({
          ...row,
          organizationId,
        })),
      } as never);
    }
    default:
      return query(args as never);
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
function buildModelOverrides(): Record<string, Record<string, unknown>> {
  const overrides: Record<string, Record<string, unknown>> = {};

  for (const modelName of ALL_SCOPED_MODEL_NAMES) {
    const key = lowerFirst(modelName);

    overrides[key] = {
      async findUnique(this: any, args: OperationArgs) {
        const where = flattenUniqueWhere(args.where as Record<string, unknown>);
        return this.findFirst({ ...args, where });
      },

      async findUniqueOrThrow(this: any, args: OperationArgs) {
        const where = flattenUniqueWhere(args.where as Record<string, unknown>);
        return this.findFirstOrThrow({ ...args, where });
      },

      // NB: not atomic with the updateMany below it (two round trips). If
      // a later task needs update-then-return to be all-or-nothing, wrap
      // this in a $transaction -- documented here rather than fixed,
      // because closing it isn't required for anything currently in this
      // codebase (see task 3 fix-round-1 report, Important 6/upsert note
      // for the parallel ruling on upsert).
      async update(this: any, args: OperationArgs) {
        const where = flattenUniqueWhere(args.where as Record<string, unknown>);
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
          // Race: the row was deleted between the findFirst above and here.
          throw notFoundError(modelName);
        }
        return this.findFirstOrThrow({
          where: pkWhere,
          select: args["select"],
          include: args["include"],
        });
      },

      async delete(this: any, args: OperationArgs) {
        const where = flattenUniqueWhere(args.where as Record<string, unknown>);
        const existing = await this.findFirst({
          where,
          select: args["select"],
          include: args["include"],
        });
        if (!existing) {
          throw notFoundError(modelName);
        }
        await this.deleteMany({
          where: primaryKeyWhereFor(modelName, existing),
        });
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
      async upsert(this: any, args: OperationArgs) {
        const where = flattenUniqueWhere(args.where as Record<string, unknown>);
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
export const tenantScopingExtension = Prisma.defineExtension((client) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  const extended: any = client.$extends({
    name: "tenant-scoping",
    // buildModelOverrides() returns a dynamically-keyed object (one entry
    // per scoped model, computed from TENANT_SCOPED_MODELS /
    // INDIRECT_TENANT_SCOPED_MODELS / SELF_SCOPED_MODELS) rather than a
    // literal object typed against Prisma's generated per-model extension
    // shape, so it is cast here rather than fought into the exact generic
    // Prisma expects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: buildModelOverrides() as any,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return runScopedOperation(
            model,
            operation,
            args,
            query as (args: never) => Promise<unknown>,
            () => extended,
          );
        },
      },
    },
  });
  return extended;
});
