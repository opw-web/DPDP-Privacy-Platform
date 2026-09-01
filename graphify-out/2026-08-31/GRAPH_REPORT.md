# Graph Report - DPDP app  (2026-08-31)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2826 nodes · 5868 edges · 192 communities (134 shown, 58 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 182 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44a58be6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Consent & Breach Checklist
- DPDP Compliance Checklist
- 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)
- 4. REQUIREMENTS
- devDependencies
- 2. ARCHITECTURE
- SecurityMeasuresTab.tsx
- Tasks
- compilerOptions
- public.decorator.ts
- UpdateOrganizationDto
- scripts
- nest-cli.json
- jest.config.ts
- tenant.extension.ts
- SharingTab.tsx
- CryptoService
- eslint-plugin-prettier
- SettingsPage.tsx
- token.service.ts
- @nestjs/schematics
- @nestjs/testing
- read-only-http.client.ts
- prettier
- prisma
- lib/auth.ts
- MeDataPage.test.tsx
- employees.controller.ts
- seed.ts
- PurposesService
- employeeLogin
- @types/cookie-parser
- demo-company-server/package.json
- ReviewQueuePage.test.tsx
- PrincipalDetailPage.test.tsx
- connector.factory.ts
- unmerge.controller.ts
- DataSourceNewPage.test.tsx
- .record
- @typescript-eslint/parser
- server.ts
- cn
- CreateSharingActivityDto
- RolesController
- canonicalJson
- compilerOptions
- exclude
- DataSourcesController
- DataSourcesService
- DataSourceDetailPage.test.tsx
- main.tsx
- HealthService
- Public
- generate.ts
- backend/package.json
- security-measures.service.ts
- CreateEmployeeDto
- demo-company-server
- employees.module.ts
- dependencies
- 4. REQUIREMENTS
- devDependencies
- DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING
- RequirePermission
- source-purposes.service.ts
- 1. IDEA CONTEXT (read this first)
- mappings.e2e-spec.ts
- rest-api.connector.ts
- createApiClient
- EmployeeAuthController
- RestApiConnector
- AuditReadController
- DashboardPage.test.tsx
- CreateTransferDto
- LineageService
- normalization.service.ts
- prisma.service.ts
- retention.service.ts
- UpdatePurposeDto
- DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS
- dataset.test.ts
- generateDataset
- SyncQueueService
- app.module.ts
- recipients.service.ts
- Rng
- PrincipalAuthController
- MaskingService
- PrincipalsService
- sync.queue.ts
- AppModule
- SyncLockService
- data-sources.service.ts
- EmployeesController
- 2. ARCHITECTURE
- compilerOptions
- assembly.service.ts
- principals.e2e-spec.ts
- sync-error.spec.ts
- mapping-warning-response.dto.ts
- merge-unmerge.e2e-spec.ts
- PrincipalDetailPage.tsx
- candidates.service.ts
- sync.e2e-spec.ts
- EmployeesPage.test.tsx
- ListPrincipalsDto
- AuditPage.test.tsx
- data-sources.e2e-spec.ts
- api-client.ts
- EmployeesPage.tsx
- api-client.test.ts
- principals.service.ts
- sync-pipeline.service.ts
- EmployeeLoginDto
- ropa-export.service.ts
- .trigger
- .me
- AccessTokenPayload
- routes.test.ts
- EnvironmentVariables
- MeService
- dependencies
- EmployeesService
- card.tsx
- .me
- RecipientsTab.test.tsx
- TransfersTab.tsx
- audit-read.service.ts
- class-transformer
- PrismaService
- compilerOptions
- cookie-parser
- csv-writer.ts
- ioredis
- InventoryController
- sync.service.ts
- jsonwebtoken
- @nestjs/config
- nestjs-pino
- @nestjs/platform-express
- me.service.ts
- PrismaModule
- scripts
- @nestjs/swagger
- router.test.tsx
- frontend/package.json
- data-sources.module.ts
- pg
- pino-http
- react-dom
- eslint-plugin-react-hooks
- globals
- tailwindcss
- vite-env.d.ts
- @types/papaparse
- typescript-eslint
- @radix-ui/react-dialog
- vitest
- @prisma/client
- reflect-metadata
- jest
- sonner
- MeHomePage.test.tsx
- zod
- @nestjs/cli
- pino-pretty
- source-map-support
- supertest
- ts-jest
- PrincipalsController
- require-permission.decorator.ts
- ts-loader
- CreatePurposeDto
- mappings.service.ts
- ts-node
- tsconfig-paths
- @types/jest
- @types/jsonwebtoken
- @types/node
- @types/pg
- @types/supertest
- typescript
- @typescript-eslint/eslint-plugin
- AuditReadService

## God Nodes (most connected - your core abstractions)
1. `PrismaService` - 97 edges
2. `RequirePermission()` - 82 edges
3. `AuditService` - 53 edges
4. `cn()` - 46 edges
5. `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` - 37 edges
6. `ScopedTransactionClient` - 36 edges
7. `humanizeEnum()` - 32 edges
8. `Button` - 32 edges
9. `Tasks` - 31 edges
10. `employeeLogin()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `RuleGroupCard()` --calls--> `humanizeEnum()`  [EXTRACTED]
  dpdp-platform/frontend/src/fiduciary/components/registers/SecurityMeasuresTab.tsx → dpdp-platform/frontend/src/fiduciary/lib/enum-options.ts
- `LawfulBasisCell()` --calls--> `humanizeEnum()`  [EXTRACTED]
  dpdp-platform/frontend/src/fiduciary/pages/PurposesPage.tsx → dpdp-platform/frontend/src/fiduciary/lib/enum-options.ts
- `RequireEmployeeAuth()` --calls--> `useEmployeeAuth()`  [EXTRACTED]
  dpdp-platform/frontend/src/router.tsx → dpdp-platform/frontend/src/lib/auth.ts
- `ConflictingValue` --references--> `SourceRef`  [EXTRACTED]
  dpdp-platform/frontend/src/fiduciary/components/ConflictBadge.tsx → dpdp-platform/frontend/src/fiduciary/components/LineageChip.tsx
- `PrincipalDetail` --references--> `SourceRef`  [EXTRACTED]
  dpdp-platform/frontend/src/fiduciary/pages/PrincipalDetailPage.tsx → dpdp-platform/frontend/src/fiduciary/components/LineageChip.tsx

## Import Cycles
- None detected.

## Communities (192 total, 58 thin omitted)

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

### Community 6 - "SecurityMeasuresTab.tsx"
Cohesion: 0.04
Nodes (55): Tabs, CheckboxOption, CheckboxOptionProps, FieldShell(), FieldShellProps, SelectControl, CreatePurposePayload, DEFAULT_VALUES (+47 more)

### Community 7 - "Tasks"
Cohesion: 0.05
Nodes (36): DPDP Platform MVP 1 — Implementation Plan, File Structure, Global Constraints, Risks and rulings taken up front, Task 10: Demo dataset generator — 500 records, 327 people, and the traps, Task 11: RestApiConnector with a GET-only HTTP client, Task 12: Data-source CRUD and credential encryption, Task 13: Field mapping, purpose attachment and the data-minimisation warning (+28 more)

### Community 8 - "compilerOptions"
Cohesion: 0.06
Nodes (30): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+22 more)

### Community 9 - "public.decorator.ts"
Cohesion: 0.25
Nodes (3): IS_PUBLIC_KEY, JwtEmployeeGuard, Injectable

### Community 10 - "UpdateOrganizationDto"
Cohesion: 0.08
Nodes (25): ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional (+17 more)

### Community 11 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, format, lint, seed, seed:principals, start, start:debug (+6 more)

### Community 12 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 15 - "tenant.extension.ts"
Cohesion: 0.12
Nodes (21): ALL_SCOPED_MODEL_NAMES, buildModelOverrides(), lowerFirst(), mergeWhere(), OperationArgs, organizationCreateBlockedError(), PRIMARY_KEY_FIELDS, primaryKeyWhereFor() (+13 more)

### Community 17 - "SharingTab.tsx"
Cohesion: 0.06
Nodes (39): DataTable(), clickAction, columns, Row, Badge(), BadgeProps, badgeVariants, Button (+31 more)

### Community 18 - "CryptoService"
Cohesion: 0.20
Nodes (8): CryptoModule, Module, CryptoService, InvalidEncryptionKeyError, MalformedCiphertextError, makeService(), VALID_KEY_B64, Injectable

### Community 20 - "SettingsPage.tsx"
Cohesion: 0.10
Nodes (24): describeSaveError(), SdfDeclarationCard(), SdfDeclarationCardProps, SdfDeclarationFields, sdfFormSchema, SdfFormValues, ORGANIZATION, THIRD_SCHEDULE_CLASSES (+16 more)

### Community 21 - "token.service.ts"
Cohesion: 0.07
Nodes (24): TenantMiddleware, Injectable, getDummyHash(), EmployeeAuthService, EmployeeLoginResult, EmployeeRefreshResult, Injectable, LoginRequestMeta (+16 more)

### Community 24 - "read-only-http.client.ts"
Cohesion: 0.22
Nodes (9): defaultSleep(), ReadOnlyHttpClient, ReadOnlyHttpMethodError, ReadOnlyHttpRequestOptions, ReadOnlyHttpResponse, ReadOnlyHttpStatusError, ReadOnlyHttpTimeoutError, RETRY_BACKOFF_MS (+1 more)

### Community 27 - "lib/auth.ts"
Cohesion: 0.12
Nodes (23): loginAs(), AuthStatus, bootstrapEmployeeSession(), bootstrapPrincipalSession(), employeeAuthStore, EmployeeSession, EmployeeSummary, fetchEmployeeMe() (+15 more)

### Community 28 - "MeDataPage.test.tsx"
Cohesion: 0.33
Nodes (3): categoryLabel(), MeDataPage(), MOCK_PAYLOAD

### Community 29 - "employees.controller.ts"
Cohesion: 0.18
Nodes (10): ResetEmployeePasswordDto, ApiProperty, IsString, MinLength, ApiPropertyOptional, IsEnum, IsOptional, IsString (+2 more)

### Community 30 - "seed.ts"
Cohesion: 0.05
Nodes (45): DEMO_EMPLOYEES, DEMO_ORG, DEMO_PASSWORD, DemoEmployeeSeed, main(), PERMISSIONS, PermissionSeed, claimDemoPrincipalAccounts() (+37 more)

### Community 31 - "PurposesService"
Cohesion: 0.12
Nodes (13): PurposesController, ApiTags, Body, Controller, Get, Param, Patch, Post (+5 more)

### Community 32 - "employeeLogin"
Cohesion: 0.14
Nodes (18): jsonResponse(), loginAndRender(), MockRoutes, SOURCE_RECORDS_RESPONSE, jsonResponse(), LIST_RESPONSE, loginAndRender(), Routes (+10 more)

### Community 34 - "demo-company-server/package.json"
Cohesion: 0.07
Nodes (26): better-sqlite3, dependencies, better-sqlite3, fastify, description, devDependencies, ts-node, @types/better-sqlite3 (+18 more)

### Community 35 - "ReviewQueuePage.test.tsx"
Cohesion: 0.28
Nodes (7): MatchCandidateListItem, apiErrorMessage(), ReviewQueuePage(), CANDIDATE, jsonResponse(), loginAndRender(), MockRoutes

### Community 36 - "PrincipalDetailPage.test.tsx"
Cohesion: 0.29
Nodes (7): AttributedValue(), DETAIL_RESPONSE, jsonResponse(), loginAndRender(), MockRoutes, RECIPIENTS_RESPONSE, SOURCE_RECORDS_RESPONSE

### Community 37 - "connector.factory.ts"
Cohesion: 0.21
Nodes (5): ConnectorFactory, Injectable, Connector, ConnectorsModule, Module

### Community 38 - "unmerge.controller.ts"
Cohesion: 0.16
Nodes (10): ApiProperty, IsString, MinLength, UnmergeDto, ApiTags, Body, Controller, Param (+2 more)

### Community 39 - "DataSourceNewPage.test.tsx"
Cohesion: 0.38
Nodes (5): ATTACHED_PURPOSE, CREATED_DATA_SOURCE, jsonResponse(), loginAndRenderWizard(), renderWizard()

### Community 40 - ".record"
Cohesion: 0.18
Nodes (11): assertNoForbiddenMetadata(), ScopedTransactionClient, ApplyMatchResult, IdentifierOwnershipConflictError, initialPrincipalDisplayName(), LinkableNormalizedRecord, LinkingService, Injectable (+3 more)

### Community 42 - "server.ts"
Cohesion: 0.30
Nodes (15): requireBearer(), System, SYSTEM_KEYS, openDb(), onlyGet(), envelope(), PageParams, parsePageParams() (+7 more)

### Community 43 - "cn"
Cohesion: 0.10
Nodes (28): DataTableProps, EmptyStateConfig, Input, InputProps, Label, Table, TableBody, TableCell (+20 more)

### Community 44 - "CreateSharingActivityDto"
Cohesion: 0.06
Nodes (34): CreateSharingActivityDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum (+26 more)

### Community 45 - "RolesController"
Cohesion: 0.18
Nodes (7): RolesController, ApiTags, Body, Controller, Get, Param, Patch

### Community 46 - "canonicalJson"
Cohesion: 0.33
Nodes (6): canonicalJson(), Custom, stringify(), typeLabel(), hashPayload(), verifyChainIntact()

### Community 47 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 48 - "exclude"
Cohesion: 0.17
Nodes (11): compilerOptions, noEmit, outDir, rootDir, exclude, extends, ../dist, ../node_modules (+3 more)

### Community 49 - "DataSourcesController"
Cohesion: 0.15
Nodes (10): Delete, DataSourcesController, ApiTags, Body, Controller, Get, HttpCode, Param (+2 more)

### Community 50 - "DataSourcesService"
Cohesion: 0.22
Nodes (4): DataSourcesService, duplicateNameMessage(), isUniqueConstraintViolation(), Injectable

### Community 51 - "DataSourceDetailPage.test.tsx"
Cohesion: 0.47
Nodes (5): DataSourceDetailPage(), DATA_SOURCE, jsonResponse(), loginAndRenderDetailPage(), renderDetailPage()

### Community 52 - "main.tsx"
Cohesion: 0.50
Nodes (3): queryClient, rootElement, AppRouter()

### Community 53 - "HealthService"
Cohesion: 0.14
Nodes (12): ApiServiceUnavailableResponse, HealthController, ApiOkResponse, ApiTags, Controller, Get, HttpCode, HealthModule (+4 more)

### Community 54 - "Public"
Cohesion: 0.16
Nodes (16): ApiExtraModels, CurrentPrincipal, Public(), JwtPrincipalGuard, PrincipalActor, Injectable, MePrivacyContactDto, ApiProperty (+8 more)

### Community 55 - "generate.ts"
Cohesion: 0.09
Nodes (23): ACCOUNT_STATUSES, Built, CAMPAIGN_SOURCES, CITY_POOL, EMAIL_FIELD, FIRST_NAMES, LAST_NAMES, PHONE_FIELD (+15 more)

### Community 56 - "backend/package.json"
Cohesion: 0.25
Nodes (7): description, license, name, prisma, seed, private, version

### Community 57 - "security-measures.service.ts"
Cohesion: 0.07
Nodes (33): CreateSecurityMeasureDto, SECURITY_MEASURE_TYPES, SECURITY_RULE_REFERENCES, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsIn (+25 more)

### Community 58 - "CreateEmployeeDto"
Cohesion: 0.29
Nodes (5): CreateEmployeeDto, ApiProperty, IsEmail, IsString, MinLength

### Community 59 - "demo-company-server"
Cohesion: 0.18
Nodes (10): Access log, demo-company-server, Demo dataset (`npm run seed`), Endpoints — copy-paste table, Field names (deliberately messy — do not "fix" them), Personas, Running, Schema (+2 more)

### Community 60 - "employees.module.ts"
Cohesion: 0.19
Nodes (10): ApiProperty, ArrayUnique, IsArray, IsString, UpdateRolePermissionsDto, EmployeesModule, Module, NOTE: the fixed AuditAction union (Task 4, spec lines 880-891) has (+2 more)

### Community 61 - "dependencies"
Cohesion: 0.13
Nodes (15): argon2, bullmq, class-validator, dependencies, argon2, bullmq, class-validator, @nestjs/bullmq (+7 more)

### Community 62 - "4. REQUIREMENTS"
Cohesion: 0.22
Nodes (9): 4.1 Tenancy, auth and permissions (SE-02, GO-04), 4.2 Connector layer, 4.3 Purposes and lawful basis (LB-01, LB-02, CN-02), 4.4 Normalization and identity resolution (GO-03), 4.5 API surface (MVP 1), 4.6 Frontend pages (MVP 1), 4.7 Audit requirements, 4.8 The demo company server (+1 more)

### Community 63 - "devDependencies"
Cohesion: 0.07
Nodes (29): autoprefixer, devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-refresh, jsdom, postcss (+21 more)

### Community 64 - "DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING"
Cohesion: 0.29
Nodes (6): 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 1 GOAL (definition of done), DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING, Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every feature here exists to satisfy a checklist ID., Self-contained build document. Paste this entire file as your vibe-coding prompt.

### Community 65 - "RequirePermission"
Cohesion: 0.16
Nodes (13): RequirePermission(), MappingsController, ApiOkResponse, ApiTags, Body, Controller, Get, Param (+5 more)

### Community 66 - "source-purposes.service.ts"
Cohesion: 0.13
Nodes (16): AttachPurposesDto, ApiProperty, ArrayUnique, IsArray, IsString, DataSourcePurposeResponseDto, DataSourcePurposesResponseDto, ApiProperty (+8 more)

### Community 67 - "1. IDEA CONTEXT (read this first)"
Cohesion: 0.50
Nodes (4): 1. IDEA CONTEXT (read this first), Non-negotiable project rules (apply to BOTH MVPs), The DPDP concepts you need, in plain language, What MVP 1 delivers when done

### Community 68 - "mappings.e2e-spec.ts"
Cohesion: 0.24
Nodes (4): createEmployee(), createOrg(), createOrgWithBothPermissions(), ensurePermission()

### Community 69 - "rest-api.connector.ts"
Cohesion: 0.15
Nodes (11): DecodedCursor, extractRecords(), inferType(), InvalidCursorError, isIsoDateString(), PageCapExceededError, RestApiConnectorConfig, SAMPLE_TRUNCATE_LENGTH (+3 more)

### Community 70 - "createApiClient"
Cohesion: 0.48
Nodes (7): createApiClient(), buildInit(), onAuthExpired(), rawRequest(), refresh(), requestJson(), extractMessage()

### Community 71 - "EmployeeAuthController"
Cohesion: 0.27
Nodes (8): EmployeeAuthController, ApiTags, Body, Controller, HttpCode, Post, Req, Res

### Community 73 - "AuditReadController"
Cohesion: 0.19
Nodes (9): AuditReadController, ApiTags, Controller, Get, Query, Res, AccessLogExportDto, IsOptional (+1 more)

### Community 74 - "DashboardPage.test.tsx"
Cohesion: 0.20
Nodes (12): GapsPanelProps, InventoryGap, InventorySummary, BASE_SUMMARY, FORBIDDEN_CLAIM_PATTERNS, jsonResponse(), loginAndRender(), MockRoutes (+4 more)

### Community 75 - "CreateTransferDto"
Cohesion: 0.06
Nodes (31): CreateTransferDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional (+23 more)

### Community 77 - "normalization.service.ts"
Cohesion: 0.11
Nodes (19): NormalizationModule, Module, asPayload(), copyJson(), NormalizationService, NormalizationSourceRecord, NormalizedRecordInput, nullableString() (+11 more)

### Community 78 - "prisma.service.ts"
Cohesion: 0.10
Nodes (20): RecordPersonalDataViewedInput, AuditAction, NOTE: the spec's §4.7 prose claims "33 MVP 1 action names", but the, AuditRecordInput, FORBIDDEN_METADATA_KEY_FRAGMENTS, TenantScopedPrismaClient, allocateCounterValue(), AUDIT_COUNTER_NAME (+12 more)

### Community 79 - "retention.service.ts"
Cohesion: 0.06
Nodes (36): CreateRetentionPolicyDto, RETENTION_LEGAL_BASIS_TYPES, RETENTION_TRIGGER_TYPES, RETENTION_UNITS, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn (+28 more)

### Community 80 - "UpdatePurposeDto"
Cohesion: 0.20
Nodes (9): ApiPropertyOptional, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength, ValidateIf (+1 more)

### Community 81 - "DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS"
Cohesion: 0.17
Nodes (11): 1. IDEA CONTEXT (read this first), 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 2 GOAL (definition of done), DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS, Non-negotiable rules (carried from MVP 1, still binding), Notice · Consent · Children · Rights · Retention · Breach · Evidence, One new rule, specific to MVP 2 (+3 more)

### Community 82 - "dataset.test.ts"
Cohesion: 0.12
Nodes (18): seedDatabase(), selfCheck(), toSimRecords(), last6(), nameKey(), normalizeEmail(), normalizePhone(), SimCandidate (+10 more)

### Community 83 - "generateDataset"
Cohesion: 0.32
Nodes (11): formatDob(), generateDataset(), adultDob(), buildLinkedPair(), childDob(), fillSystemRecord(), nextEmail(), nextPhoneDigits() (+3 more)

### Community 84 - "SyncQueueService"
Cohesion: 0.18
Nodes (6): ScheduleReconciliationService, Injectable, SyncQueueService, syncSchedulerId(), Injectable, InjectQueue

### Community 85 - "app.module.ts"
Cohesion: 0.11
Nodes (22): AuditModule, Module, MaskingModule, Module, ReferenceModule, Module, TenantModule, Module (+14 more)

### Community 86 - "recipients.service.ts"
Cohesion: 0.06
Nodes (33): CreateRecipientDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional (+25 more)

### Community 88 - "PrincipalAuthController"
Cohesion: 0.16
Nodes (13): PrincipalLoginDto, ApiProperty, IsEmail, IsString, MinLength, PrincipalAuthController, ApiTags, Body (+5 more)

### Community 89 - "MaskingService"
Cohesion: 0.29
Nodes (4): CAN_VIEW_ALL_PERSONAL_DATA, MaskingService, PASS_THROUGH_FIELDS, Injectable

### Community 90 - "PrincipalsService"
Cohesion: 0.22
Nodes (4): AccessLogService, Injectable, PrincipalsService, Injectable

### Community 91 - "sync.queue.ts"
Cohesion: 0.15
Nodes (12): SyncCounts, SyncPipelineService, SyncRunSummary, Injectable, zeroCounts(), SyncProcessor, FREQUENCY_CRON_PATTERNS, SYNC_QUEUE_NAME (+4 more)

### Community 93 - "SyncLockService"
Cohesion: 0.29
Nodes (4): lockKey(), SyncLockService, Injectable, syncJobId()

### Community 94 - "data-sources.service.ts"
Cohesion: 0.08
Nodes (25): CONNECTOR_SOURCE_SELECT, DATA_SOURCE_FIELD_SELECT, DATA_SOURCE_PUBLIC_SELECT, PublicDataSource, PublicDataSourceField, TestConnectionResult, CreateDataSourceDto, ApiProperty (+17 more)

### Community 95 - "EmployeesController"
Cohesion: 0.21
Nodes (8): EmployeesController, ApiTags, Body, Controller, Get, Param, Patch, Post

### Community 96 - "2. ARCHITECTURE"
Cohesion: 0.33
Nodes (6): 2.1 New packages (everything from MVP 1 stays), 2.2 New Prisma models (all MVP 1 models unchanged), 2.3 Raw SQL follow-up migration, 2.4 Seeded compliance rules — defaults for a DPO to review, not legal advice, 2.5 Background jobs (added to the MVP 1 BullMQ setup), 2. ARCHITECTURE

### Community 97 - "compilerOptions"
Cohesion: 0.07
Nodes (29): compilerOptions, allowImportingTsExtensions, baseUrl, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+21 more)

### Community 98 - "assembly.service.ts"
Cohesion: 0.11
Nodes (22): ageStatusFor(), compareNewest(), DobCandidate, AssembledField, assembleFields(), AssemblyMapping, AssemblyRecord, compareNewest() (+14 more)

### Community 99 - "principals.e2e-spec.ts"
Cohesion: 0.23
Nodes (8): MAX_PRINCIPALS_PAGE, PRINCIPALS_PAGE_SIZE, createFixture(), createPrincipal(), createSource(), EmployeeSession, ensurePermission(), Fixture

### Community 100 - "sync-error.spec.ts"
Cohesion: 0.16
Nodes (10): describeSyncError(), MESSAGE_SAFE_ERROR_CLASSES, MissingRecordKeyError, IdentifierOwnershipConflictError, NotFoundException, PageCapExceededError, SomeFutureDomainError, SyncErrorDescription (+2 more)

### Community 101 - "mapping-warning-response.dto.ts"
Cohesion: 0.36
Nodes (7): MappingWarningPurposeSummaryResponseDto, MappingWarningResponseDto, ApiProperty, MappingsResponseDto, SourceFieldMappingResponseDto, ApiProperty, MappingWarningType

### Community 102 - "merge-unmerge.e2e-spec.ts"
Cohesion: 0.24
Nodes (10): activeLink(), attachIdentifier(), CandidateLoader, dataSource(), ensurePermission(), principal(), rebuild(), reviewerFor() (+2 more)

### Community 103 - "PrincipalDetailPage.tsx"
Cohesion: 0.10
Nodes (29): SourceChip(), SourceChipProps, ConflictBadge(), ConflictBadgeProps, ConflictingValue, LineageChip(), LineageChipProps, SourceRef (+21 more)

### Community 104 - "candidates.service.ts"
Cohesion: 0.28
Nodes (7): CandidateNormalizedRecord, CandidateSignal, isoDate(), MatchCandidateListItem, recordValueFor(), SIGNAL_FIELDS, SignalAgreement

### Community 105 - "sync.e2e-spec.ts"
Cohesion: 0.28
Nodes (5): RECONCILE_BOOT_TIMEOUT_MS, createDataSource(), employeeWithPermissions(), ensurePermission(), tenant()

### Community 106 - "EmployeesPage.test.tsx"
Cohesion: 0.22
Nodes (9): DemoCredentialsBanner(), shouldShowDemoCredentials(), EMPLOYEES, jsonResponse(), loginAndRenderThroughShell(), LoginOptions, ORGANIZATION, PatchEmployeeStatusBox (+1 more)

### Community 107 - "ListPrincipalsDto"
Cohesion: 0.25
Nodes (8): ListPrincipalsDto, IsEnum, IsInt, IsOptional, IsString, Max, Min, Transform

### Community 108 - "AuditPage.test.tsx"
Cohesion: 0.32
Nodes (7): AuditEventListItem, AuditEventListResult, AUDIT_EVENT, jsonResponse(), loginAndRenderThroughShell(), MockRoutes, ORGANIZATION

### Community 109 - "data-sources.e2e-spec.ts"
Cohesion: 0.16
Nodes (10): DataSourceRowForConnector, jsonHandler(), MockHttpServer, createManager(), createOrgWithRole(), ensurePermission(), startRecordsServer(), startRecordsServer() (+2 more)

### Community 110 - "api-client.ts"
Cohesion: 0.05
Nodes (69): ExportButtons(), handleExport(), ExportDefinition, EXPORTS, saveBlob(), TextareaControl, ConnectionFormValues, connectionSchema (+61 more)

### Community 111 - "EmployeesPage.tsx"
Cohesion: 0.13
Nodes (21): PermissionGate(), PermissionGateProps, LinkedRecordsPanel(), LinkedRecordsPanelProps, SourceRecordItem, SourceRecordsResponse, unmergeErrorMessage(), createEmployeeSchema (+13 more)

### Community 113 - "principals.service.ts"
Cohesion: 0.20
Nodes (10): pickDisplayName(), resolveProvenance(), SourceRef, PRINCIPAL_FIELD_SELECT, buildPrincipalSearchQuery(), PrincipalSearchQueryParams, PRINCIPAL_DETAIL_SELECT, PrincipalFieldRow (+2 more)

### Community 114 - "sync-pipeline.service.ts"
Cohesion: 0.08
Nodes (32): customerIdSignal(), hasSoleVerifiedCustomerIdMapping(), verifiedCustomerIdValue(), emailSignal(), phoneSignal(), lastSix(), sameDate(), SCORE_BY_SIGNAL (+24 more)

### Community 115 - "EmployeeLoginDto"
Cohesion: 0.33
Nodes (5): EmployeeLoginDto, ApiProperty, IsEmail, IsString, MinLength

### Community 116 - "ropa-export.service.ts"
Cohesion: 0.16
Nodes (12): InventoryModule, Module, InventoryGap, InventoryService, InventorySummary, RecentAuditEvent, ShortfallCounts, Injectable (+4 more)

### Community 117 - ".trigger"
Cohesion: 0.33
Nodes (3): HttpCode, Param, Post

### Community 118 - ".me"
Cohesion: 0.33
Nodes (5): EmployeeMeResponseDto, EmployeeMeRoleDto, ApiProperty, ApiOkResponse, Get

### Community 119 - "AccessTokenPayload"
Cohesion: 0.14
Nodes (14): CurrentActor, AccessTokenPayload, CandidatesController, ApiTags, Controller, Get, Param, Post (+6 more)

### Community 120 - "routes.test.ts"
Cohesion: 0.25
Nodes (7): closeDb(), { buildServer }, EXPECTED_FIELDS, KEYS, { openDb, closeDb }, ROUTES, TEST_DB_PATH

### Community 121 - "EnvironmentVariables"
Cohesion: 0.21
Nodes (10): ACCESS_LOG_RETENTION_FLOOR_DAYS, EnvironmentVariables, IsIn, IsInt, IsNotEmpty, IsString, Min, MinLength (+2 more)

### Community 123 - "dependencies"
Cohesion: 0.06
Nodes (31): class-variance-authority, clsx, dependencies, class-variance-authority, clsx, @hookform/resolvers, lucide-react, papaparse (+23 more)

### Community 125 - "card.tsx"
Cohesion: 0.06
Nodes (49): EmptyState(), EmptyStateAction, EmptyStateProps, Skeleton(), Card, CardContent, CardDescription, CardHeader (+41 more)

### Community 127 - "RecipientsTab.test.tsx"
Cohesion: 0.40
Nodes (5): jsonResponse(), loginAndRender(), RouteHooks, toastError, toastSuccess

### Community 128 - "TransfersTab.tsx"
Cohesion: 0.10
Nodes (22): AppShell(), NAV_ITEMS, OrganizationSummary, DateTime(), DateTimeProps, OrgTimezoneContext, OrgTimezoneProvider, useOrgTimezone() (+14 more)

### Community 129 - "audit-read.service.ts"
Cohesion: 0.12
Nodes (17): AUDIT_ACTIONS, ACCESS_LOG_CSV_HEADER, AUDIT_EVENT_LIST_SELECT, AuditEventListItem, AuditEventListResult, AuditEventListRow, AUDIT_EVENTS_PAGE_SIZE, ListAuditEventsDto (+9 more)

### Community 131 - "PrismaService"
Cohesion: 0.06
Nodes (19): AuditService, Injectable, extendWithTenantScoping(), PrismaService, Injectable, ReferenceService, Injectable, EMPLOYEE_PUBLIC_SELECT (+11 more)

### Community 132 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include (+1 more)

### Community 134 - "csv-writer.ts"
Cohesion: 0.39
Nodes (6): csvDocument(), csvField(), csvRow(), needsQuoting(), RFC-4180, RFC-4180

### Community 136 - "InventoryController"
Cohesion: 0.24
Nodes (5): InventoryController, ApiTags, Controller, Get, Res

### Community 137 - "sync.service.ts"
Cohesion: 0.11
Nodes (18): DEFAULT_SYNC_JOB_LIST_LIMIT, ListSyncJobsQueryDto, MAX_SYNC_JOB_LIST_LIMIT, IsInt, IsOptional, IsString, Max, Min (+10 more)

### Community 142 - "me.service.ts"
Cohesion: 0.27
Nodes (6): DATA_CATEGORY_ORDER, MeDataCategoryGroup, MeDataValue, ResolvedPrincipalField, PrincipalRecipientsService, Injectable

### Community 143 - "PrismaModule"
Cohesion: 0.67
Nodes (3): PrismaModule, Module, Global

### Community 144 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, preview, test, test:watch, typecheck

### Community 147 - "frontend/package.json"
Cohesion: 0.29
Nodes (6): description, license, name, private, type, version

### Community 148 - "data-sources.module.ts"
Cohesion: 0.12
Nodes (13): AppConfig, BigInt, DataSourcesModule, Module, SyncModule, Module, QueuesModule, Module (+5 more)

### Community 180 - "PrincipalsController"
Cohesion: 0.26
Nodes (7): CurrentActorPermissions, PrincipalsController, ApiTags, Controller, Get, Param, Query

### Community 181 - "require-permission.decorator.ts"
Cohesion: 0.27
Nodes (4): PERMISSION_KEY, PermissionsGuard, PermissionsRequest, Injectable

### Community 183 - "CreatePurposeDto"
Cohesion: 0.25
Nodes (8): CreatePurposeDto, ApiProperty, ApiPropertyOptional, IsArray, IsEnum, IsOptional, IsString, MinLength

### Community 184 - "mappings.service.ts"
Cohesion: 0.10
Nodes (23): ReplaceMappingsDto, SourceFieldMappingDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsEnum, IsOptional (+15 more)

## Knowledge Gaps
- **743 isolated node(s):** `NotFoundException`, `PageCapExceededError`, `SomeFutureDomainError`, `SyncErrorDescription`, `CandidateLoader` (+738 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **58 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequirePermission()` connect `RequirePermission` to `audit-read.service.ts`, `InventoryController`, `sync.service.ts`, `UpdateOrganizationDto`, `me.service.ts`, `employees.controller.ts`, `PurposesService`, `unmerge.controller.ts`, `CreateSharingActivityDto`, `RolesController`, `DataSourcesController`, `DataSourcesService`, `PrincipalsController`, `require-permission.decorator.ts`, `security-measures.service.ts`, `CreateEmployeeDto`, `employees.module.ts`, `source-purposes.service.ts`, `AuditReadController`, `CreateTransferDto`, `retention.service.ts`, `recipients.service.ts`, `PrincipalsService`, `data-sources.service.ts`, `EmployeesController`, `ropa-export.service.ts`, `.trigger`, `AccessTokenPayload`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `PrismaService` to `audit-read.service.ts`, `sync.service.ts`, `UpdateOrganizationDto`, `me.service.ts`, `token.service.ts`, `seed.ts`, `CreateSharingActivityDto`, `require-permission.decorator.ts`, `Public`, `mappings.service.ts`, `security-measures.service.ts`, `employees.module.ts`, `RequirePermission`, `source-purposes.service.ts`, `mappings.e2e-spec.ts`, `CreateTransferDto`, `LineageService`, `prisma.service.ts`, `retention.service.ts`, `SyncQueueService`, `recipients.service.ts`, `PrincipalsService`, `AppModule`, `data-sources.service.ts`, `assembly.service.ts`, `principals.e2e-spec.ts`, `merge-unmerge.e2e-spec.ts`, `candidates.service.ts`, `sync.e2e-spec.ts`, `data-sources.e2e-spec.ts`, `principals.service.ts`, `sync-pipeline.service.ts`, `ropa-export.service.ts`, `MeService`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `AuditService` connect `PrismaService` to `audit-read.service.ts`, `UpdateOrganizationDto`, `token.service.ts`, `.record`, `CreateSharingActivityDto`, `mappings.service.ts`, `security-measures.service.ts`, `employees.module.ts`, `source-purposes.service.ts`, `CreateTransferDto`, `prisma.service.ts`, `retention.service.ts`, `app.module.ts`, `recipients.service.ts`, `PrincipalsService`, `data-sources.service.ts`, `assembly.service.ts`, `candidates.service.ts`, `sync-pipeline.service.ts`, `ropa-export.service.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `NotFoundException`, `PageCapExceededError`, `SomeFutureDomainError` to the rest of the system?**
  _743 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Consent & Breach Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `DPDP Compliance Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._