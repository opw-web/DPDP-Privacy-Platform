import { Prisma } from "@prisma/client";
import { TenantContext } from "./tenant-context";
import {
  INDIRECT_TENANT_SCOPED_MODELS,
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
 * Two mechanisms compose to cover all 13 Prisma operations named in the
 * task brief:
 *
 *  1. A `query` component (`$allModels.$allOperations`) that injects the
 *     tenant filter into `where` (read/update/delete-many ops) or forces
 *     `organizationId` in `data` (create ops), for every tenant-scoped
 *     model. This covers findFirst(OrThrow), findMany, count, aggregate,
 *     groupBy, updateMany, deleteMany, create and createMany directly.
 *
 *  2. A `model` component that replaces findUnique, findUniqueOrThrow,
 *     update, delete and upsert on each tenant-scoped model with an
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
 */

type ScopeConfig = { kind: "direct" } | { kind: "indirect"; relation: string };

const SCOPE_BY_MODEL: Readonly<Record<string, ScopeConfig>> = {
  ...Object.fromEntries(
    TENANT_SCOPED_MODELS.map((model) => [model, { kind: "direct" as const }]),
  ),
  ...Object.fromEntries(
    Object.entries(INDIRECT_TENANT_SCOPED_MODELS).map(([model, cfg]) => [
      model,
      { kind: "indirect" as const, relation: cfg.relation },
    ]),
  ),
};

const ALL_SCOPED_MODEL_NAMES: readonly string[] = [
  ...TENANT_SCOPED_MODELS,
  ...Object.keys(INDIRECT_TENANT_SCOPED_MODELS),
];

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Builds the `{ organizationId }` or `{ <relation>: { organizationId } }` filter. */
function tenantFilterFor(
  scope: ScopeConfig,
  organizationId: string,
): Record<string, unknown> {
  if (scope.kind === "direct") {
    return { organizationId };
  }
  return { [scope.relation]: { organizationId } };
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

interface OperationArgs {
  where?: unknown;
  data?: unknown;
  [key: string]: unknown;
}

function applyTenantFilter(
  model: string,
  operation: string,
  rawArgs: unknown,
): unknown {
  const scope = SCOPE_BY_MODEL[model];
  if (!scope) {
    // Organization, Permission, or anything not yet registered: pass through
    // untouched. (A new model with an organizationId column that is missing
    // from TENANT_SCOPED_MODELS also falls into this branch -- caught by
    // tenant-scoped-models.spec.ts, not by this function.)
    return rawArgs;
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
      return { ...args, where: mergeWhere(args.where, filter) };
    }
    case "updateMany": {
      return {
        ...args,
        where: mergeWhere(args.where, filter),
        data: stripOrganizationId(args.data),
      };
    }
    case "deleteMany": {
      return { ...args, where: mergeWhere(args.where, filter) };
    }
    case "create": {
      if (scope.kind !== "direct") return args;
      return {
        ...args,
        data: { ...(args.data as Record<string, unknown>), organizationId },
      };
    }
    case "createMany": {
      if (scope.kind !== "direct") return args;
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      return {
        ...args,
        data: rows.map((row: Record<string, unknown>) => ({
          ...row,
          organizationId,
        })),
      };
    }
    default:
      return args;
  }
}

/**
 * Builds the `model` extension component: for every tenant-scoped model
 * (direct and indirect), replaces findUnique/findUniqueOrThrow/update/
 * delete/upsert with implementations built on findFirst(OrThrow)/
 * updateMany/deleteMany/create, so the tenant filter (applied by the query
 * component above, on those underlying operations) can never be bypassed.
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

      async update(this: any, args: OperationArgs) {
        const where = flattenUniqueWhere(args.where as Record<string, unknown>);
        const { count } = await this.updateMany({ where, data: args.data });
        if (count === 0) {
          throw notFoundError(modelName);
        }
        return this.findFirstOrThrow({
          where,
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
        await this.deleteMany({ where });
        return existing;
      },

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

export const tenantScopingExtension = Prisma.defineExtension({
  name: "tenant-scoping",
  // buildModelOverrides() returns a dynamically-keyed object (one entry per
  // tenant-scoped model, computed from TENANT_SCOPED_MODELS /
  // INDIRECT_TENANT_SCOPED_MODELS) rather than a literal object typed
  // against Prisma's generated per-model extension shape, so it is cast
  // here rather than fought into the exact generic Prisma expects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: buildModelOverrides() as any,
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        return query(applyTenantFilter(model, operation, args) as never);
      },
    },
  },
});
