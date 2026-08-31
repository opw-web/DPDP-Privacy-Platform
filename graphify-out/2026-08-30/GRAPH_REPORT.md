# Graph Report - DPDP app  (2026-08-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1489 nodes · 2617 edges · 105 communities (69 shown, 36 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 103 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b32dd9bd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Consent & Breach Checklist
- DPDP Compliance Checklist
- 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)
- 4. REQUIREMENTS
- devDependencies
- 2. ARCHITECTURE
- dependencies
- Tasks
- compilerOptions
- Public
- auth.module.ts
- scripts
- nest-cli.json
- jest.config.ts
- tenant.extension.ts
- seed.ts
- employees.module.ts
- eslint-plugin-prettier
- jest
- @nestjs/cli
- @nestjs/schematics
- @nestjs/testing
- pino-pretty
- prettier
- prisma
- source-map-support
- supertest
- ts-jest
- ts-loader
- ts-node
- tsconfig-paths
- @types/cookie-parser
- demo-company-server/package.json
- @types/jest
- @types/jsonwebtoken
- @types/pg
- @types/supertest
- typescript
- @typescript-eslint/eslint-plugin
- @typescript-eslint/parser
- server.ts
- UpdateOrganizationDto
- CreateSharingActivityDto
- TokenService
- PrincipalAuthService
- compilerOptions
- exclude
- data-sources.service.ts
- canonicalJson
- mappings.service.ts
- MaskingService
- purposes.service.ts
- CryptoService
- generate.ts
- backend/package.json
- .record
- data-sources.e2e-spec.ts
- demo-company-server
- app.module.ts
- argon2
- 4. REQUIREMENTS
- class-validator
- DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING
- @types/node
- ioredis
- 1. IDEA CONTEXT (read this first)
- jsonwebtoken
- @nestjs/common
- @nestjs/core
- nestjs-pino
- @nestjs/platform-express
- @prisma/client
- rxjs
- registers.module.ts
- PrismaService
- DataSourcesService
- prisma.service.ts
- retention.service.ts
- principal-auth.service.ts
- DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS
- dataset.test.ts
- generateDataset
- personas.ts
- match.ts
- recipients.service.ts
- Rng
- rest-api.connector.ts
- employees.service.ts
- audit.service.ts
- permissions.ts
- RequirePermission
- require-permission.decorator.ts
- UpdateRolePermissionsDto
- EmployeesService
- 2. ARCHITECTURE
- UpdateDataSourceDto
- CreateEmployeeDto
- mappings.e2e-spec.ts
- registers.e2e-spec.ts
- EnvironmentVariables
- PermissionsController
- TenantModule

## God Nodes (most connected - your core abstractions)
1. `PrismaService` - 60 edges
2. `RequirePermission()` - 57 edges
3. `AuditService` - 38 edges
4. `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` - 37 edges
5. `Tasks` - 31 edges
6. `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` - 25 edges
7. `compilerOptions` - 23 edges
8. `TokenService` - 22 edges
9. `DPDP COMPLIANCE CHECKLIST` - 22 edges
10. `DataSourcesService` - 20 edges

## Surprising Connections (you probably didn't know these)
- `ReplaceMappingsResult` --references--> `MappingWarning`  [EXTRACTED]
  dpdp-platform/backend/src/modules/data-sources/mappings.service.ts → dpdp-platform/backend/src/modules/data-sources/mapping-warnings.ts
- `buildService()` --calls--> `PurposesService`  [EXTRACTED]
  dpdp-platform/backend/src/modules/purposes/purposes.service.spec.ts → dpdp-platform/backend/src/modules/purposes/purposes.service.ts
- `makeService()` --calls--> `CryptoService`  [EXTRACTED]
  dpdp-platform/backend/src/common/crypto/crypto.service.spec.ts → dpdp-platform/backend/src/common/crypto/crypto.service.ts
- `main()` --calls--> `PrismaService`  [EXTRACTED]
  dpdp-platform/backend/prisma/seed.ts → dpdp-platform/backend/src/common/prisma/prisma.service.ts
- `generateDataset()` --calls--> `Rng`  [EXTRACTED]
  demo-company-server/src/seed/generate.ts → demo-company-server/src/seed/rng.ts

## Import Cycles
- None detected.

## Communities (105 total, 36 thin omitted)

### Community 0 - "Consent & Breach Checklist"
Cohesion: 0.05
Nodes (37): 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step), Check 10: Consent evidence is complete and frozen (CN-09), Check 11: Legitimate-use purposes never show a consent toggle (LB-06), Check 12: A child cannot be marketed to (CH-05) — the flagship prohibition, Check 13: A child's consent requires a verified guardian (CH-01…CH-03), Check 14: Preview count equals send count, exactly, Check 15: Compliance messages are not consent-filtered, Check 16: Sending is idempotent (+29 more)

### Community 1 - "DPDP Compliance Checklist"
Cohesion: 0.08
Nodes (24): 0. HOW TO USE THIS DOCUMENT, 10. RETENTION AND ERASURE (Section 8(7)–(8), Rule 8, Third Schedule), 11. DATA PRINCIPAL RIGHTS (Sections 11–14, Rule 14), 12. PROCESSORS, SHARING AND CROSS-BORDER, 13. SIGNIFICANT DATA FIDUCIARY (Section 10, Rule 13), 14. BOARD AND GOVERNMENT INTERACTION, 15. PENALTIES (Section 33 and the Schedule), 16. THE EVIDENCE PACK — what a company must be able to produce on demand (+16 more)

### Community 2 - "6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)"
Cohesion: 0.08
Nodes (25): 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step), Check 10: Conflicts are surfaced, not silently resolved (GO-03), Check 11: Purpose and lawful basis are never inferred (LB-02), Check 12: The registers actually answer s.11(1)(b) (RT-04), Check 13: A processor cannot go live without a contract (GO-02), Check 14: Credentials are encrypted and never leave the backend, Check 15: The access log records who looked at whom (SE-03, SE-05), Check 16: The audit log cannot be edited (+17 more)

### Community 3 - "4. REQUIREMENTS"
Cohesion: 0.13
Nodes (15): 4.10 Breach (BR-01…BR-15), 4.11 SDF pack (SD-01…SD-07), 4.12 Board and Government interaction (BD-01…BD-06), 4.13 New API endpoints, 4.14 Frontend, 4.1 ComplianceService — the engine everything calls, 4.2 Notice builder (NT-01…NT-10), 4.3 Consent (CN-01…CN-11) (+7 more)

### Community 4 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, eslint, eslint-config-prettier, @types/express, eslint, eslint-config-prettier, @types/express

### Community 5 - "2. ARCHITECTURE"
Cohesion: 0.22
Nodes (9): 2.1 Tech stack (locked — do not substitute), 2.2 Machine setup — Linux Mint Cinnamon (run these exactly), 2.3 Ports (locked), 2.4 Folder structure, 2.5 Database schema — Prisma (source of truth), 2.6 Raw SQL Prisma cannot express (second migration), 2.7 docker-compose.yml and .env, 2.8 The sync pipeline (+1 more)

### Community 6 - "dependencies"
Cohesion: 0.13
Nodes (15): class-transformer, cookie-parser, dependencies, class-transformer, cookie-parser, @nestjs/config, @nestjs/swagger, pg (+7 more)

### Community 7 - "Tasks"
Cohesion: 0.05
Nodes (36): DPDP Platform MVP 1 — Implementation Plan, File Structure, Global Constraints, Risks and rulings taken up front, Task 10: Demo dataset generator — 500 records, 327 people, and the traps, Task 11: RestApiConnector with a GET-only HTTP client, Task 12: Data-source CRUD and credential encryption, Task 13: Field mapping, purpose attachment and the data-minimisation warning (+28 more)

### Community 8 - "compilerOptions"
Cohesion: 0.06
Nodes (30): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+22 more)

### Community 9 - "Public"
Cohesion: 0.05
Nodes (39): ApiOkResponse, ApiServiceUnavailableResponse, Public(), EmployeeLoginDto, ApiProperty, IsEmail, IsString, MinLength (+31 more)

### Community 10 - "auth.module.ts"
Cohesion: 0.18
Nodes (10): AuditModule, Module, CurrentPrincipal, JwtPrincipalGuard, PrincipalActor, Injectable, AuthModule, Module (+2 more)

### Community 11 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, format, lint, seed, start, start:debug, start:dev (+5 more)

### Community 12 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 15 - "tenant.extension.ts"
Cohesion: 0.12
Nodes (21): ALL_SCOPED_MODEL_NAMES, buildModelOverrides(), lowerFirst(), mergeWhere(), OperationArgs, organizationCreateBlockedError(), PRIMARY_KEY_FIELDS, primaryKeyWhereFor() (+13 more)

### Community 17 - "seed.ts"
Cohesion: 0.20
Nodes (10): DEMO_EMPLOYEES, DEMO_ORG, DEMO_PASSWORD, DemoEmployeeSeed, main(), runSeed(), seedDemoEmployees(), seedOrganization() (+2 more)

### Community 18 - "employees.module.ts"
Cohesion: 0.17
Nodes (9): EmployeesModule, Module, RolesController, ApiTags, Controller, Get, NOTE: the fixed AuditAction union (Task 4, spec lines 880-891) has, RolesService (+1 more)

### Community 34 - "demo-company-server/package.json"
Cohesion: 0.07
Nodes (26): better-sqlite3, dependencies, better-sqlite3, fastify, description, devDependencies, ts-node, @types/better-sqlite3 (+18 more)

### Community 42 - "server.ts"
Cohesion: 0.19
Nodes (22): requireBearer(), System, SYSTEM_KEYS, closeDb(), openDb(), onlyGet(), envelope(), PageParams (+14 more)

### Community 43 - "UpdateOrganizationDto"
Cohesion: 0.08
Nodes (25): ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional (+17 more)

### Community 44 - "CreateSharingActivityDto"
Cohesion: 0.06
Nodes (34): CreateSharingActivityDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum (+26 more)

### Community 45 - "TokenService"
Cohesion: 0.13
Nodes (7): IS_PUBLIC_KEY, JwtEmployeeGuard, Injectable, TenantMiddleware, Injectable, TokenService, Injectable

### Community 46 - "PrincipalAuthService"
Cohesion: 0.18
Nodes (5): EmployeeAuthService, Injectable, PrincipalAuthService, Injectable, rotateRefreshToken()

### Community 47 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 48 - "exclude"
Cohesion: 0.17
Nodes (11): compilerOptions, noEmit, outDir, rootDir, exclude, extends, ../dist, ../node_modules (+3 more)

### Community 49 - "data-sources.service.ts"
Cohesion: 0.12
Nodes (16): CONNECTOR_SOURCE_SELECT, DATA_SOURCE_FIELD_SELECT, DATA_SOURCE_PUBLIC_SELECT, PublicDataSource, PublicDataSourceField, TestConnectionResult, CreateDataSourceDto, ApiProperty (+8 more)

### Community 50 - "canonicalJson"
Cohesion: 0.43
Nodes (5): canonicalJson(), Custom, stringify(), typeLabel(), verifyChainIntact()

### Community 51 - "mappings.service.ts"
Cohesion: 0.06
Nodes (44): CryptoModule, Module, DataSourcesModule, Module, AttachPurposesDto, ApiProperty, ArrayUnique, IsArray (+36 more)

### Community 52 - "MaskingService"
Cohesion: 0.23
Nodes (6): MaskingModule, Module, CAN_VIEW_ALL_PERSONAL_DATA, MaskingService, PASS_THROUGH_FIELDS, Injectable

### Community 53 - "purposes.service.ts"
Cohesion: 0.07
Nodes (36): CurrentActor, Get, AccessTokenPayload, CreatePurposeDto, ApiProperty, ApiPropertyOptional, IsArray, IsEnum (+28 more)

### Community 54 - "CryptoService"
Cohesion: 0.26
Nodes (6): CryptoService, InvalidEncryptionKeyError, MalformedCiphertextError, makeService(), VALID_KEY_B64, Injectable

### Community 55 - "generate.ts"
Cohesion: 0.14
Nodes (15): ACCOUNT_STATUSES, Built, CAMPAIGN_SOURCES, CITY_POOL, EMAIL_FIELD, FIRST_NAMES, LAST_NAMES, personaToBuilt() (+7 more)

### Community 56 - "backend/package.json"
Cohesion: 0.25
Nodes (7): description, license, name, prisma, seed, private, version

### Community 57 - ".record"
Cohesion: 0.06
Nodes (34): assertNoForbiddenMetadata(), CreateSecurityMeasureDto, SECURITY_MEASURE_TYPES, SECURITY_RULE_REFERENCES, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString (+26 more)

### Community 58 - "data-sources.e2e-spec.ts"
Cohesion: 0.20
Nodes (7): jsonHandler(), MockHttpServer, createManager(), createOrgWithRole(), ensurePermission(), startRecordsServer(), startRecordsServer()

### Community 59 - "demo-company-server"
Cohesion: 0.18
Nodes (10): Access log, demo-company-server, Demo dataset (`npm run seed`), Endpoints — copy-paste table, Field names (deliberately messy — do not "fix" them), Personas, Running, Schema (+2 more)

### Community 60 - "app.module.ts"
Cohesion: 0.14
Nodes (11): AppModule, Module, PrismaModule, Module, ReferenceModule, Module, ACCESS_LOG_RETENTION_FLOOR_DAYS, AppConfig (+3 more)

### Community 62 - "4. REQUIREMENTS"
Cohesion: 0.22
Nodes (9): 4.1 Tenancy, auth and permissions (SE-02, GO-04), 4.2 Connector layer, 4.3 Purposes and lawful basis (LB-01, LB-02, CN-02), 4.4 Normalization and identity resolution (GO-03), 4.5 API surface (MVP 1), 4.6 Frontend pages (MVP 1), 4.7 Audit requirements, 4.8 The demo company server (+1 more)

### Community 64 - "DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING"
Cohesion: 0.29
Nodes (6): 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 1 GOAL (definition of done), DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING, Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every feature here exists to satisfy a checklist ID., Self-contained build document. Paste this entire file as your vibe-coding prompt.

### Community 67 - "1. IDEA CONTEXT (read this first)"
Cohesion: 0.50
Nodes (4): 1. IDEA CONTEXT (read this first), Non-negotiable project rules (apply to BOTH MVPs), The DPDP concepts you need, in plain language, What MVP 1 delivers when done

### Community 75 - "registers.module.ts"
Cohesion: 0.06
Nodes (33): CreateTransferDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional (+25 more)

### Community 76 - "PrismaService"
Cohesion: 0.14
Nodes (5): AuditService, Injectable, extendWithTenantScoping(), PrismaService, Injectable

### Community 77 - "DataSourcesService"
Cohesion: 0.33
Nodes (4): DataSourcesService, duplicateNameMessage(), isUniqueConstraintViolation(), Injectable

### Community 78 - "prisma.service.ts"
Cohesion: 0.15
Nodes (5): ReferenceService, Injectable, storage, TenantContext, TenantStore

### Community 79 - "retention.service.ts"
Cohesion: 0.06
Nodes (36): CreateRetentionPolicyDto, RETENTION_LEGAL_BASIS_TYPES, RETENTION_TRIGGER_TYPES, RETENTION_UNITS, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn (+28 more)

### Community 80 - "principal-auth.service.ts"
Cohesion: 0.15
Nodes (15): getDummyHash(), EmployeeLoginResult, EmployeeRefreshResult, LoginRequestMeta, PRINCIPAL_ACCOUNT_PUBLIC_SELECT, PrincipalLoginResult, PrincipalRefreshResult, PublicPrincipalAccount (+7 more)

### Community 81 - "DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS"
Cohesion: 0.17
Nodes (11): 1. IDEA CONTEXT (read this first), 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 2 GOAL (definition of done), DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS, Non-negotiable rules (carried from MVP 1, still binding), Notice · Consent · Children · Rights · Retention · Breach · Evidence, One new rule, specific to MVP 2 (+3 more)

### Community 82 - "dataset.test.ts"
Cohesion: 0.15
Nodes (8): SEED, { DOB_REFERENCE_DATE }, { openDb, closeDb }, NOTE: each table has its own named INTEGER PRIMARY KEY (id / crm_id /, { seedDatabase, generateDataset, toSimRecords, SEED }, { simulateMatching, normalizeEmail, normalizePhone, nameKey }, TEST_DB_PATH, TEST_DB_PATH_2

### Community 83 - "generateDataset"
Cohesion: 0.36
Nodes (10): formatDob(), generateDataset(), adultDob(), buildLinkedPair(), childDob(), fillSystemRecord(), nextEmail(), nextPhoneDigits() (+2 more)

### Community 84 - "personas.ts"
Cohesion: 0.18
Nodes (10): AnyRecord, DOB_REFERENCE_DATE, EcommerceRecord, MarketingRecord, PersonaPerson, personas, RESERVED_NAMES, RESERVED_PINCODES (+2 more)

### Community 85 - "match.ts"
Cohesion: 0.29
Nodes (9): last6(), nameKey(), normalizeEmail(), normalizePhone(), SimCandidate, SimPrincipal, SimRecord, SimResult (+1 more)

### Community 86 - "recipients.service.ts"
Cohesion: 0.06
Nodes (33): CreateRecipientDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional (+25 more)

### Community 88 - "rest-api.connector.ts"
Cohesion: 0.06
Nodes (27): ConnectorFactory, DataSourceRowForConnector, Injectable, Connector, ConnectorsModule, Module, defaultSleep(), ReadOnlyHttpClient (+19 more)

### Community 89 - "employees.service.ts"
Cohesion: 0.16
Nodes (12): ResetEmployeePasswordDto, ApiProperty, IsString, MinLength, ApiPropertyOptional, IsEnum, IsOptional, IsString (+4 more)

### Community 90 - "audit.service.ts"
Cohesion: 0.16
Nodes (12): AccessLogService, RecordPersonalDataViewedInput, Injectable, AUDIT_ACTIONS, AuditAction, NOTE: the spec's §4.7 prose claims "33 MVP 1 action names", but the, AuditRecordInput, FORBIDDEN_METADATA_KEY_FRAGMENTS (+4 more)

### Community 91 - "permissions.ts"
Cohesion: 0.20
Nodes (9): PERMISSIONS, PermissionSeed, ALL_PERMISSION_CODES, ROLES, RoleSeed, createOrgWithManager(), ensurePermission(), createOrgWithEmployee() (+1 more)

### Community 92 - "RequirePermission"
Cohesion: 0.11
Nodes (13): Delete, RequirePermission(), DataSourcesController, ApiTags, Body, Controller, Get, HttpCode (+5 more)

### Community 93 - "require-permission.decorator.ts"
Cohesion: 0.21
Nodes (5): CurrentActorPermissions, PERMISSION_KEY, PermissionsGuard, PermissionsRequest, Injectable

### Community 94 - "UpdateRolePermissionsDto"
Cohesion: 0.22
Nodes (8): ApiProperty, ArrayUnique, IsArray, IsString, UpdateRolePermissionsDto, Body, Param, Patch

### Community 95 - "EmployeesService"
Cohesion: 0.16
Nodes (9): EmployeesController, ApiTags, Body, Controller, Get, Param, Patch, EmployeesService (+1 more)

### Community 96 - "2. ARCHITECTURE"
Cohesion: 0.33
Nodes (6): 2.1 New packages (everything from MVP 1 stays), 2.2 New Prisma models (all MVP 1 models unchanged), 2.3 Raw SQL follow-up migration, 2.4 Seeded compliance rules — defaults for a DPO to review, not legal advice, 2.5 Background jobs (added to the MVP 1 BullMQ setup), 2. ARCHITECTURE

### Community 97 - "UpdateDataSourceDto"
Cohesion: 0.22
Nodes (9): ApiPropertyOptional, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength (+1 more)

### Community 98 - "CreateEmployeeDto"
Cohesion: 0.25
Nodes (6): CreateEmployeeDto, ApiProperty, IsEmail, IsString, MinLength, Post

### Community 99 - "mappings.e2e-spec.ts"
Cohesion: 0.31
Nodes (4): createEmployee(), createOrg(), createOrgWithBothPermissions(), ensurePermission()

### Community 100 - "registers.e2e-spec.ts"
Cohesion: 0.39
Nodes (8): authed(), createDataSource(), createEmployeeWithPermissions(), createOrgWithManager(), createPurpose(), createRecipient(), ensurePermission(), recipientPayload()

### Community 101 - "EnvironmentVariables"
Cohesion: 0.25
Nodes (8): EnvironmentVariables, IsIn, IsInt, IsNotEmpty, IsString, Min, MinLength, Type

### Community 102 - "PermissionsController"
Cohesion: 0.33
Nodes (4): PermissionsController, ApiTags, Controller, Get

## Knowledge Gaps
- **404 isolated node(s):** `OperationArgs`, `ScopeConfig`, `TenantScopedModel`, `DemoEmployeeSeed`, `System` (+399 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequirePermission()` connect `RequirePermission` to `CreateEmployeeDto`, `PermissionsController`, `UpdateOrganizationDto`, `CreateSharingActivityDto`, `registers.module.ts`, `retention.service.ts`, `data-sources.service.ts`, `employees.module.ts`, `mappings.service.ts`, `purposes.service.ts`, `recipients.service.ts`, `employees.service.ts`, `.record`, `require-permission.decorator.ts`, `UpdateRolePermissionsDto`, `EmployeesService`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `PrismaService` to `auth.module.ts`, `seed.ts`, `employees.module.ts`, `UpdateOrganizationDto`, `CreateSharingActivityDto`, `TokenService`, `PrincipalAuthService`, `data-sources.service.ts`, `mappings.service.ts`, `purposes.service.ts`, `.record`, `data-sources.e2e-spec.ts`, `registers.module.ts`, `prisma.service.ts`, `retention.service.ts`, `principal-auth.service.ts`, `recipients.service.ts`, `employees.service.ts`, `permissions.ts`, `require-permission.decorator.ts`, `mappings.e2e-spec.ts`, `registers.e2e-spec.ts`, `PermissionsController`, `principal-auth.e2e-spec.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **What connects `OperationArgs`, `ScopeConfig`, `TenantScopedModel` to the rest of the system?**
  _404 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Consent & Breach Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `DPDP Compliance Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `4. REQUIREMENTS` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._