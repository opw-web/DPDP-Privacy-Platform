import { Prisma } from "@prisma/client";

/**
 * Every Prisma model that carries its own `organizationId` column, i.e.
 * every model that must never be read, created, updated or deleted without
 * the current tenant's organizationId in scope.
 *
 * Derived by walking the schema (28 models total) and taking every model
 * with an `organizationId` scalar field:
 *
 *   Role, Employee, PrincipalAccount, RefreshToken, ProcessingPurpose,
 *   DataSource, DataSourceField, SourceFieldMapping, DataRecipient,
 *   SharingActivity, CrossBorderTransfer, RetentionPolicy, SecurityMeasure,
 *   SyncJob, SourceRecord, NormalizedRecord, DataPrincipal,
 *   PrincipalIdentifier, IdentityLink, PrincipalDataField, MatchCandidate,
 *   PrincipalContactEvent, AuditEvent, Counter.
 *
 * Handled elsewhere in this file, and why:
 *   - `Organization` has no organizationId column -- it IS the tenant. It
 *     is not exempt from scoping (see fix-round-1 note below): it is
 *     scoped to itself (`SELF_SCOPED_MODELS`), filtered by `id` instead of
 *     by `organizationId`, with create/createMany blocked on the scoped
 *     client entirely (an org is created via the raw client at signup).
 *   - `Permission` has no organizationId -- it is the ONE model the spec
 *     (line 691) and the task brief name as deliberately global: a small,
 *     hand-seeded catalog of permission codes shared by every
 *     organization. `GLOBAL_MODELS` contains only this model.
 *   - `RolePermission` and `DataSourcePurpose` are pure join tables (a
 *     composite primary key of two foreign ids) with no organizationId
 *     column of their own. They are scoped *indirectly*, through their
 *     parent (`Role` / `DataSource`) -- see
 *     `INDIRECT_TENANT_SCOPED_MODELS` below and tenant.extension.ts for
 *     how reads/updates/deletes are filtered by the parent's
 *     organizationId, and how create/createMany verify the foreign id
 *     through the scoped parent delegate instead of trusting it blind.
 *
 * FIX ROUND 1 (task 3 review): the first pass wrongly listed `Organization`
 * alongside `Permission` in `GLOBAL_MODELS`, which let
 * `prisma.scoped.organization.findMany({})` return every tenant's row --
 * name, DPO contact details, SDF declarations, the works, no id-guessing
 * required. `Organization` now has its own `SELF_SCOPED_MODELS` bucket.
 * `Permission` is the only model in `GLOBAL_MODELS`, matching the spec.
 *
 * `tenant-scoped-models.spec.ts` asserts `TENANT_SCOPED_MODELS ∪
 * INDIRECT_TENANT_SCOPED_MODELS ∪ SELF_SCOPED_MODELS ∪ GLOBAL_MODELS`
 * covers every model in the live Prisma schema, exactly once, so a model
 * added in a later task without updating this list fails a unit test
 * instead of silently leaking data.
 *
 * Later tasks that add a model with an organizationId column MUST add its
 * name here. A missed entry is a silent tenant-isolation hole.
 */
export const TENANT_SCOPED_MODELS = [
  "Role",
  "Employee",
  "PrincipalAccount",
  "RefreshToken",
  "ProcessingPurpose",
  "DataSource",
  "DataSourceField",
  "SourceFieldMapping",
  "DataRecipient",
  "SharingActivity",
  "CrossBorderTransfer",
  "RetentionPolicy",
  "SecurityMeasure",
  "SyncJob",
  "SourceRecord",
  "NormalizedRecord",
  "DataPrincipal",
  "PrincipalIdentifier",
  "IdentityLink",
  "PrincipalDataField",
  "MatchCandidate",
  "PrincipalContactEvent",
  "AuditEvent",
  "Counter",
] as const satisfies readonly Prisma.ModelName[];

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

/**
 * Models with no organizationId column of their own, reached only through
 * one or more tenant-scoped parents. Scoped indirectly by filtering on the
 * named to-one relations' organizationId instead of a column on the model
 * itself, and by verifying EVERY listed foreign id through its scoped
 * parent delegate on create/createMany. See tenant.extension.ts for how
 * this is applied, and the task 3 report for the reasoning.
 *
 * `relations` is a list, not a single relation, because a join table can
 * have more than one foreign key pointing at a tenant-scoped parent --
 * `DataSourcePurpose` has two (`dataSourceId` -> DataSource, `purposeId`
 * -> ProcessingPurpose), and BOTH must be verified on create. Fix round 1
 * (task 3 review, Critical 2) originally verified only `dataSourceId`,
 * which left a caller-supplied `purposeId` from another organization
 * completely unchecked -- exactly the write-then-nested-read leak the
 * review described, just through the other foreign key.
 */
export const INDIRECT_TENANT_SCOPED_MODELS = {
  RolePermission: { relations: ["role"] },
  DataSourcePurpose: { relations: ["dataSource", "purpose"] },
} as const satisfies Record<string, { relations: readonly string[] }>;

/**
 * Models with no organizationId column because they ARE the tenant.
 * Scoped to themselves: filtered by `{ id: organizationId }` on every
 * read/update/delete, with create/createMany blocked on the scoped client
 * (an organization is created via the raw `PrismaService`, not through a
 * tenant context that presupposes the organization already exists).
 */
export const SELF_SCOPED_MODELS = [
  "Organization",
] as const satisfies readonly Prisma.ModelName[];

/**
 * The one model in the schema deliberately outside tenant scoping
 * altogether: `Permission`, the global catalog of permission codes shared
 * by every organization (spec line 691).
 */
export const GLOBAL_MODELS = [
  "Permission",
] as const satisfies readonly Prisma.ModelName[];
