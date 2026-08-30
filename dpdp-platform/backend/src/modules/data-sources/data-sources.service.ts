import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { TenantScopedPrismaClient } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { AuditService } from "../../common/audit/audit.service";
import { CryptoService } from "../../common/crypto/crypto.service";
import {
  ConnectorFactory,
  type DataSourceRowForConnector,
} from "../connectors/connector.factory";
import type { Connector } from "../connectors/connector.interface";
import { CreateDataSourceDto } from "./dto/create-data-source.dto";
import { UpdateDataSourceDto } from "./dto/update-data-source.dto";

/**
 * The ONLY shape of `DataSource` this service (or the controller behind
 * it) ever returns. `credentialCipher` is deliberately absent -- spec
 * line 314: "NEVER returned by any API." Same discipline as
 * `EMPLOYEE_PUBLIC_SELECT` (Task 5) and `PURPOSE_PUBLIC_SELECT` (Task 8):
 * one shared `select` constant, not a per-call-site `omit`/`delete`, so a
 * future call site cannot forget to strip it -- a dropped field here
 * fails to typecheck against `PublicDataSource` everywhere it is used.
 */
export const DATA_SOURCE_PUBLIC_SELECT = {
  id: true,
  name: true,
  systemType: true,
  baseUrl: true,
  recordsPath: true,
  externalIdField: true,
  authType: true,
  credentialHint: true,
  supportsIncremental: true,
  incrementalParam: true,
  paginationStyle: true,
  pageSize: true,
  syncFrequency: true,
  status: true,
  containsOnlyPubliclyAvailableData: true,
  publiclyAvailableJustification: true,
  hostingCountry: true,
  lastSyncAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DataSourceSelect;

export type PublicDataSource = Prisma.DataSourceGetPayload<{
  select: typeof DATA_SOURCE_PUBLIC_SELECT;
}>;

/** The row shape `buildConnector` reads: everything the factory needs, PLUS `credentialCipher` for this method alone to decrypt. */
const CONNECTOR_SOURCE_SELECT = {
  name: true,
  baseUrl: true,
  recordsPath: true,
  externalIdField: true,
  authType: true,
  paginationStyle: true,
  pageSize: true,
  supportsIncremental: true,
  incrementalParam: true,
  credentialCipher: true,
} satisfies Prisma.DataSourceSelect;

const DATA_SOURCE_FIELD_SELECT = {
  id: true,
  fieldName: true,
  sampleValue: true,
  inferredType: true,
} satisfies Prisma.DataSourceFieldSelect;

export type PublicDataSourceField = Prisma.DataSourceFieldGetPayload<{
  select: typeof DATA_SOURCE_FIELD_SELECT;
}>;

/**
 * `DataSource` has `@@unique([organizationId, name])`. Pre-checked in
 * both `create()` and `update()` for a clean 409 on the common path, and
 * re-caught as P2002 below as the race backstop -- same convention as
 * `purposes.service.ts`'s `duplicateCodeMessage`/`isUniqueConstraintViolation`:
 * there is no `PrismaClientKnownRequestError` -> HTTP filter in this
 * codebase, so an uncaught P2002 would otherwise surface as a 500.
 */
function duplicateNameMessage(name: string): string {
  return `A data source named "${name}" already exists in this organization.`;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  dataSource: PublicDataSource;
}

@Injectable()
export class DataSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cryptoService: CryptoService,
    private readonly connectorFactory: ConnectorFactory,
  ) {}

  async list(): Promise<PublicDataSource[]> {
    return this.prisma.scoped.dataSource.findMany({
      orderBy: { createdAt: "asc" },
      select: DATA_SOURCE_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicDataSource> {
    const row = await this.prisma.scoped.dataSource.findFirst({
      where: { id },
      select: DATA_SOURCE_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Data source "${id}" not found.`);
    }
    return row;
  }

  /**
   * SC-03 / spec §1 rule 8: the platform records a human's determination,
   * it never concludes one itself. So this is a plain non-blank-string
   * check on a field a human typed, not any kind of content
   * classification -- and it is invoked from BOTH `create` and `update`
   * against the EFFECTIVE (existing + patch) value, never just the
   * patch, so a two-step "flip the flag" then "add the justification"
   * PATCH sequence cannot leave the flag true with no justification in
   * between.
   */
  private assertPubliclyAvailableJustified(
    flag: boolean,
    justification: string | null | undefined,
  ): void {
    if (flag && (!justification || justification.trim().length === 0)) {
      throw new BadRequestException(
        "publiclyAvailableJustification is required and must be non-blank " +
          "when containsOnlyPubliclyAvailableData is true (SC-03: this is " +
          "a human legal determination the platform records, never " +
          "concludes on its own).",
      );
    }
  }

  async create(dto: CreateDataSourceDto): Promise<PublicDataSource> {
    this.assertPubliclyAvailableJustified(
      dto.containsOnlyPubliclyAvailableData ?? false,
      dto.publiclyAvailableJustification,
    );

    const nameConflict = await this.prisma.scoped.dataSource.findFirst({
      where: { name: dto.name },
      select: { id: true },
    });
    if (nameConflict) {
      throw new ConflictException(duplicateNameMessage(dto.name));
    }

    // Encrypted BEFORE the transaction opens, and the plaintext
    // (`dto.credential`) is never referenced again after this block --
    // only `credentialCipher` (opaque ciphertext) and `credentialHint`
    // (last 4 chars) are written.
    let credentialCipher: string | null = null;
    let credentialHint: string | null = null;
    if (dto.credential) {
      credentialCipher = this.cryptoService.encrypt(dto.credential);
      credentialHint = dto.credential.slice(-4);
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      let created: PublicDataSource;
      try {
        created = await tx.dataSource.create({
          data: {
            name: dto.name,
            systemType: dto.systemType,
            baseUrl: dto.baseUrl,
            recordsPath: dto.recordsPath,
            externalIdField: dto.externalIdField,
            authType: dto.authType ?? "BEARER",
            credentialCipher,
            credentialHint,
            supportsIncremental: dto.supportsIncremental ?? false,
            incrementalParam: dto.incrementalParam ?? null,
            paginationStyle: dto.paginationStyle ?? "PAGE",
            pageSize: dto.pageSize ?? 100,
            syncFrequency: dto.syncFrequency ?? "MANUAL",
            containsOnlyPubliclyAvailableData:
              dto.containsOnlyPubliclyAvailableData ?? false,
            publiclyAvailableJustification:
              dto.publiclyAvailableJustification ?? null,
            hostingCountry: dto.hostingCountry ?? "IN",
            // organizationId deliberately omitted -- the tenant-scoping
            // extension supplies it at runtime (same convention as
            // EmployeesService.create).
          } as never,
          select: DATA_SOURCE_PUBLIC_SELECT,
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(duplicateNameMessage(dto.name));
        }
        throw err;
      }

      await this.auditService.record(tx, {
        action: "DATA_SOURCE_CREATED",
        resourceType: "DataSource",
        resourceId: created.id,
        metadata: {
          name: dto.name,
          systemType: dto.systemType,
          baseUrl: dto.baseUrl,
          authType: created.authType,
          // Never "hasCredential"/"credentialProvided" -- both contain
          // the forbidden "credential" fragment AuditService screens for
          // (see AuditService's FORBIDDEN_METADATA_KEY_FRAGMENTS).
          authConfigured: created.credentialHint !== null,
        },
      });

      return created;
    });
  }

  async update(
    id: string,
    dto: UpdateDataSourceDto,
  ): Promise<PublicDataSource> {
    // Minor fix round 1: narrowed to the two fields this method actually
    // reads. The previous unqualified `findFirst` pulled the FULL row --
    // `credentialCipher` included -- into memory just to check two
    // unrelated booleans/strings, an unnecessary widening of the one
    // column this whole task exists to contain.
    const existing = await this.prisma.scoped.dataSource.findFirst({
      where: { id },
      select: {
        containsOnlyPubliclyAvailableData: true,
        publiclyAvailableJustification: true,
      },
    });
    if (!existing) {
      throw new NotFoundException(`Data source "${id}" not found.`);
    }

    const effectivePubliclyAvailable =
      dto.containsOnlyPubliclyAvailableData ??
      existing.containsOnlyPubliclyAvailableData;
    const effectiveJustification =
      dto.publiclyAvailableJustification !== undefined
        ? dto.publiclyAvailableJustification
        : existing.publiclyAvailableJustification;
    this.assertPubliclyAvailableJustified(
      effectivePubliclyAvailable,
      effectiveJustification,
    );

    if (dto.name !== undefined) {
      const nameConflict = await this.prisma.scoped.dataSource.findFirst({
        where: { name: dto.name, id: { not: id } },
        select: { id: true },
      });
      if (nameConflict) {
        throw new ConflictException(duplicateNameMessage(dto.name));
      }
    }

    // Credential rotation: a value here means "replace it now." Leaving
    // it out means `credentialCipher`/`credentialHint` stay `undefined`
    // below, which Prisma's `update` treats as "do not touch this
    // column" -- the stored cipher is left byte-for-byte unchanged. This
    // API never reads the existing credential back to decide anything,
    // so there is no path by which the old plaintext could round-trip.
    let credentialCipher: string | undefined;
    let credentialHint: string | undefined;
    const isRotating = Boolean(dto.credential);
    if (dto.credential) {
      credentialCipher = this.cryptoService.encrypt(dto.credential);
      credentialHint = dto.credential.slice(-4);
    }

    const updateData: Prisma.DataSourceUpdateInput = {
      name: dto.name,
      systemType: dto.systemType,
      baseUrl: dto.baseUrl,
      recordsPath: dto.recordsPath,
      externalIdField: dto.externalIdField,
      authType: dto.authType,
      credentialCipher,
      credentialHint,
      supportsIncremental: dto.supportsIncremental,
      incrementalParam: dto.incrementalParam,
      paginationStyle: dto.paginationStyle,
      pageSize: dto.pageSize,
      syncFrequency: dto.syncFrequency,
      containsOnlyPubliclyAvailableData: dto.containsOnlyPubliclyAvailableData,
      publiclyAvailableJustification: dto.publiclyAvailableJustification,
      hostingCountry: dto.hostingCountry,
    };
    // Optimisation, not a correctness fix: when EVERY key above is
    // `undefined` (a PATCH whose only field is `credential: null` -- a
    // documented no-op, see the DTO comment -- or an empty `{}` body),
    // there is nothing to SET, so this skips the pointless
    // `update`/`updateMany` round trip entirely and goes straight to a
    // plain tenant-scoped read. The tenant extension's `update()`
    // override (src/common/tenant/tenant.extension.ts) independently
    // handles this same all-undefined-`data` shape correctly on its own
    // -- an all-undefined `data` still makes `updateMany` report `{
    // count: 0 }` on a row that genuinely exists, and the extension
    // disambiguates that from a real mid-request deletion by re-checking
    // the row before deciding whether to throw not-found -- so this
    // short-circuit is redundant with that fix; it is kept purely to
    // save the round trip for this one route.
    const hasEffectiveChange = Object.values(updateData).some(
      (value) => value !== undefined,
    );

    return this.prisma.scoped.$transaction(async (tx) => {
      let updated: PublicDataSource;
      try {
        updated = hasEffectiveChange
          ? await tx.dataSource.update({
              where: { id },
              data: updateData,
              select: DATA_SOURCE_PUBLIC_SELECT,
            })
          : await tx.dataSource.findFirstOrThrow({
              where: { id },
              select: DATA_SOURCE_PUBLIC_SELECT,
            });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(duplicateNameMessage(dto.name ?? ""));
        }
        throw err;
      }

      await this.auditService.record(tx, {
        action: "DATA_SOURCE_UPDATED",
        resourceType: "DataSource",
        resourceId: id,
        metadata: {
          name: updated.name,
          status: updated.status,
        },
      });

      if (isRotating) {
        await this.auditService.record(tx, {
          action: "DATA_SOURCE_CREDENTIALS_ROTATED",
          resourceType: "DataSource",
          resourceId: id,
          // "hint", never "credentialHint" -- AuditService's forbidden-
          // fragment screen matches on substring, and "credentialHint"
          // contains "credential".
          metadata: { hint: credentialHint ?? null },
        });
      }

      return updated;
    });
  }

  async remove(id: string): Promise<void> {
    // Same narrowing as `update()`'s `existing` lookup -- only `name` is
    // used below (for the deletion audit event), so there is no reason
    // to pull `credentialCipher` into memory here either.
    const existing = await this.prisma.scoped.dataSource.findFirst({
      where: { id },
      select: { name: true },
    });
    if (!existing) {
      throw new NotFoundException(`Data source "${id}" not found.`);
    }

    await this.prisma.scoped.$transaction(async (tx) => {
      await tx.dataSource.delete({ where: { id } });
      await this.auditService.record(tx, {
        action: "DATA_SOURCE_DELETED",
        resourceType: "DataSource",
        resourceId: id,
        metadata: { name: existing.name },
      });
    });
  }

  /**
   * The ONLY place in this codebase a credential is decrypted (task
   * brief). `row.credentialCipher` and the decrypted `credential` below
   * are both local to this method's stack frame: neither is assigned to
   * `this`, returned, logged, or included in any object this method
   * hands back -- the returned `Connector` is a `RestApiConnector`
   * instance whose own private `#config` field holds the plaintext (see
   * that class's doc comment), which this method never reads back out
   * of.
   *
   * Consumed by `testConnection`/`discoverSchema` below, and is the
   * exact call site Task 18's sync pipeline is meant to use too.
   */
  async buildConnector(id: string): Promise<Connector> {
    const row = await this.prisma.scoped.dataSource.findFirst({
      where: { id },
      select: CONNECTOR_SOURCE_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Data source "${id}" not found.`);
    }

    // Minor fix round 1: a bare 500 here (e.g. after ENCRYPTION_KEY is
    // rotated without re-entering every credential) gave an operator
    // nothing to act on. Caught and rethrown naming the data source and
    // the concrete next step, instead of leaking CryptoService's
    // internal error verbatim.
    let credential: string | null = null;
    if (row.credentialCipher) {
      try {
        credential = this.cryptoService.decrypt(row.credentialCipher);
      } catch (err) {
        throw new BadRequestException(
          `Data source "${row.name}" (${id}) has a credential that could ` +
            "not be decrypted -- this usually means ENCRYPTION_KEY has " +
            "changed since it was stored. Re-enter its credential via " +
            "PATCH /api/data-sources/:id before retrying.",
          { cause: err instanceof Error ? err : undefined },
        );
      }
    }

    const dataSourceRow: DataSourceRowForConnector = {
      name: row.name,
      baseUrl: row.baseUrl,
      recordsPath: row.recordsPath,
      externalIdField: row.externalIdField,
      authType: row.authType,
      paginationStyle: row.paginationStyle,
      pageSize: row.pageSize,
      supportsIncremental: row.supportsIncremental,
      incrementalParam: row.incrementalParam,
    };

    return this.connectorFactory.create(dataSourceRow, credential);
  }

  async testConnection(id: string): Promise<TestConnectionResult> {
    const connector = await this.buildConnector(id);
    const result = await connector.testConnection();

    const dataSource = await this.prisma.scoped.dataSource.update({
      where: { id },
      data: {
        status: result.ok ? "CONNECTED" : "ERROR",
        lastError: result.ok ? null : result.message,
      },
      select: DATA_SOURCE_PUBLIC_SELECT,
    });

    return { ...result, dataSource };
  }

  /**
   * Discovers fields from a live page-1 read and persists them as
   * `DataSourceField` rows (upsert by `[dataSourceId, fieldName]`, so a
   * re-run refreshes `sampleValue`/`inferredType` in place rather than
   * duplicating rows).
   *
   * Important fix round 1: a re-run used to overwrite `sampleValue`
   * unconditionally on the update branch, which silently UNDID
   * `rescrubFieldSample()` the next time an operator clicked "Discover
   * schema" -- spec line 733's re-scrub guarantee would otherwise expire
   * on the very next discovery run. Fixed by consulting
   * `SourceFieldMapping.containsPersonalData` (Task 13's mapping table,
   * already in the schema) for this data source BEFORE writing: a field
   * currently mapped `containsPersonalData: true` gets its
   * `inferredType` refreshed but its `sampleValue` left exactly as it
   * is (scrubbed to `null`, or whatever it already was) -- never
   * re-populated from the live read. A brand-new field on the CREATE
   * branch can never already be marked personal (no mapping exists yet
   * for a field discovery has not seen before), so writing its first
   * sample there is always safe.
   */
  async discoverSchema(id: string): Promise<PublicDataSourceField[]> {
    const connector = await this.buildConnector(id);
    const discovered = await connector.discoverSchema();

    return this.prisma.scoped.$transaction(async (tx) => {
      const personalDataFields = new Set(
        (
          await tx.sourceFieldMapping.findMany({
            where: { dataSourceId: id, containsPersonalData: true },
            select: { sourceField: true },
          })
        ).map((mapping) => mapping.sourceField),
      );

      const rows: PublicDataSourceField[] = [];
      for (const field of discovered) {
        const isKnownPersonalData = personalDataFields.has(field.fieldName);
        const row = await tx.dataSourceField.upsert({
          where: {
            dataSourceId_fieldName: {
              dataSourceId: id,
              fieldName: field.fieldName,
            },
          },
          create: {
            dataSourceId: id,
            fieldName: field.fieldName,
            sampleValue: field.sampleValue,
            inferredType: field.inferredType,
          } as never,
          update: {
            inferredType: field.inferredType,
            // `sampleValue` is deliberately OMITTED (not set to
            // `undefined` via a ternary that still writes the key) for a
            // field already known to contain personal data -- Prisma
            // leaves an omitted key untouched, so a prior scrub survives
            // this re-run.
            ...(isKnownPersonalData ? {} : { sampleValue: field.sampleValue }),
          },
          select: DATA_SOURCE_FIELD_SELECT,
        });
        rows.push(row);
      }
      return rows;
    });
  }

  async listFields(id: string): Promise<PublicDataSourceField[]> {
    const existing = await this.prisma.scoped.dataSource.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Data source "${id}" not found.`);
    }
    return this.prisma.scoped.dataSourceField.findMany({
      where: { dataSourceId: id },
      orderBy: { fieldName: "asc" },
      select: DATA_SOURCE_FIELD_SELECT,
    });
  }

  /**
   * The re-scrub contract Task 13 calls when a `SourceFieldMapping` is
   * marked `containsPersonalData = true` (spec line 733): once a field is
   * KNOWN to carry personal data, its previously-discovered
   * `DataSourceField.sampleValue` (a raw, truncated-but-real value read
   * straight off the source system during `discoverSchema`) must stop
   * being retorted anywhere -- so this nulls it out rather than
   * re-truncating or re-masking it. There is no reliable masking format
   * for an arbitrary, not-yet-canonicalized source field the way
   * `MaskingService` has one for `EMAIL`/`PHONE` on an already-mapped
   * `CanonicalField` -- `null` is the only universally-safe scrub.
   *
   * Idempotent and silent on a field that doesn't exist (or already has
   * `sampleValue: null`): `updateMany` matches zero rows rather than
   * throwing, since Task 13 may call this for a field discovery that
   * raced ahead of (or never produced) a `DataSourceField` row.
   * Tenant-scoped via `prisma.scoped` (the default) like every other call
   * in this service.
   *
   * Task 13 ruling 1: an optional `tx` parameter, defaulting to
   * `this.prisma.scoped`. `MappingsService.replace()` marks a mapping
   * `containsPersonalData: true` and this scrub inside the SAME
   * interactive transaction that writes the mapping -- a rolled-back
   * mapping that still scrubbed is harmless (a lost sample value, no
   * privacy loss), but a COMMITTED `containsPersonalData: true` mapping
   * whose scrub was lost on its own separate connection would leave real
   * personal data sitting in `sampleValue` (spec line 733). Passing the
   * caller's `tx` here is what rules out that unsafe direction; every
   * other call site (none exist yet outside Task 13) keeps getting the
   * default, non-transactional `prisma.scoped` behaviour unchanged.
   */
  async rescrubFieldSample(
    dataSourceId: string,
    fieldName: string,
    tx: ScopedTransactionClient | TenantScopedPrismaClient = this.prisma.scoped,
  ): Promise<void> {
    await tx.dataSourceField.updateMany({
      where: { dataSourceId, fieldName },
      data: { sampleValue: null },
    });
  }
}
