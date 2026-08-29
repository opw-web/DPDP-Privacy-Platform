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
 * Excluded, and why:
 *   - `Organization` has no organizationId -- it IS the tenant.
 *   - `Permission` has no organizationId -- it is the one deliberately
 *     global model in the schema (a small, hand-seeded catalog of
 *     permission codes shared by every organization).
 *   - `RolePermission` and `DataSourcePurpose` are pure join tables (a
 *     composite primary key of two foreign ids) with no organizationId
 *     column of their own. They are scoped *indirectly*, through their
 *     parent (`Role` / `DataSource`) -- see
 *     `INDIRECT_TENANT_SCOPED_MODELS` in tenant.extension.ts, and the
 *     RolePermission decision written up in the task 3 report.
 *
 * `tenant-scoped-models.spec.ts` asserts this list plus the exempt/indirect
 * models below cover every model in the live Prisma schema, so a model
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
 * Models with no organizationId column of their own, reached only through a
 * tenant-scoped parent. Scoped indirectly by filtering on the named
 * to-one relation's organizationId instead of a column on the model
 * itself. See tenant.extension.ts for how this is applied, and the task 3
 * report for the reasoning.
 */
export const INDIRECT_TENANT_SCOPED_MODELS = {
  RolePermission: { relation: "role" },
  DataSourcePurpose: { relation: "dataSource" },
} as const satisfies Record<string, { relation: string }>;

/**
 * Models deliberately outside tenant scoping altogether: `Organization`
 * (it is the tenant) and `Permission` (the one global catalog model).
 */
export const GLOBAL_MODELS = ["Organization", "Permission"] as const;
