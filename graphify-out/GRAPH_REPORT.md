# Graph Report - DPDP app  (2026-08-31)

## Corpus Check
- 365 files · ~251,286 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2882 nodes · 5999 edges · 164 communities (131 shown, 33 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 183 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f7013325`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Consent & Breach Checklist
- DPDP Compliance Checklist
- 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)
- 4. REQUIREMENTS
- devDependencies
- 2. ARCHITECTURE
- RetentionTab.tsx
- Tasks
- compilerOptions
- TokenService
- UpdateOrganizationDto
- scripts
- nest-cli.json
- jest.config.ts
- tenant.extension.ts
- SecurityMeasuresService
- CryptoService
- bullmq
- SettingsPage.tsx
- purposes.controller.ts
- jsonwebtoken
- @nestjs/config
- api-client.ts
- @nestjs/swagger
- pino-http
- lib/auth.ts
- data-sources.service.ts
- employees.controller.ts
- seed.ts
- audit.e2e-spec.ts
- ReviewQueuePage.test.tsx
- ListAuditEventsDto
- demo-company-server/package.json
- AccessTokenPayload
- PrincipalDetailPage.test.tsx
- rest-api.connector.ts
- principals.service.ts
- DataSourceNewPage.test.tsx
- .record
- EmployeesPage.tsx
- server.ts
- SecurityMeasuresTab.tsx
- CreateSharingActivityDto
- tenant-context.ts
- RestApiConnector
- compilerOptions
- exclude
- RequirePermission
- PrincipalAuthService
- seed-principals.ts
- router.test.tsx
- HealthService
- mappings.service.ts
- generate.ts
- backend/package.json
- security-measures.service.ts
- seed/permissions.ts
- demo-company-server
- UpdateRolePermissionsDto
- dependencies
- 4. REQUIREMENTS
- devDependencies
- DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING
- source-purposes.service.ts
- .me
- 1. IDEA CONTEXT (read this first)
- MVP1 Evaluation Against Spec Section 6
- read-only-http.client.ts
- DataSourcesService
- EmployeeAuthController
- MaskingService
- mappings.e2e-spec.ts
- DashboardPage.test.tsx
- CreateTransferDto
- router.tsx
- recipients.service.ts
- merge.service.ts
- CreateRetentionPolicyDto
- mapping-warnings.ts
- DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS
- dataset.test.ts
- generateDataset
- SyncQueueService
- app.module.ts
- inventory.service.ts
- Rng
- PrincipalAuthController
- AuditReadController
- principal-portal.e2e-spec.ts
- sync.e2e-spec.ts
- AppModule
- ListPrincipalsDto
- PermissionsController
- SourcePurposesService
- 2. ARCHITECTURE
- compilerOptions
- assembly.service.ts
- MeHomePage.test.tsx
- SyncPipelineService
- AuditPage.test.tsx
- merge-unmerge.e2e-spec.ts
- PrincipalDetailPage.tsx
- PrismaModule
- MappingsController
- normalization.module.ts
- principals.e2e-spec.ts
- createApiClient
- data-sources.e2e-spec.ts
- DataSourceDetailPage.tsx
- queues.module.ts
- csv-writer.ts
- registers.e2e-spec.ts
- matching.service.ts
- EmployeesPage.test.tsx
- ReplaceMappingsDto
- evaluate-mvp1.sh
- routes.test.ts
- purposes-response.dto.ts
- dependencies
- RecipientsTab.test.tsx
- SettingsPage.test.tsx
- DataSourceDetailPage.test.tsx
- inventory.e2e-spec.ts
- audit-read.service.ts
- class-transformer
- PrismaService
- compilerOptions
- cookie-parser
- connector.factory.ts
- InventoryService
- sync.service.ts
- class-validator
- @nestjs/bullmq
- nestjs-pino
- employeeLogin
- scripts
- @nestjs/core
- PrincipalLoginDto
- frontend/package.json
- configuration.ts
- pg
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
- sonner
- Public
- zod
- PrincipalsController

## God Nodes (most connected - your core abstractions)
1. `PrismaService` - 98 edges
2. `RequirePermission()` - 82 edges
3. `AuditService` - 53 edges
4. `cn()` - 46 edges
5. `ScopedTransactionClient` - 37 edges
6. `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` - 37 edges
7. `Button` - 32 edges
8. `humanizeEnum()` - 32 edges
9. `employeeLogin()` - 31 edges
10. `Tasks` - 31 edges

## Surprising Connections (you probably didn't know these)
- `TransferForm()` --calls--> `useEmployeeAuth()`  [EXTRACTED]
  dpdp-platform/frontend/src/fiduciary/components/registers/TransfersTab.tsx → dpdp-platform/frontend/src/lib/auth.ts
- `Step5DeclarationsProps` --references--> `PublicDataSource`  [EXTRACTED]
  dpdp-platform/frontend/src/fiduciary/components/wizard/Step5Declarations.tsx → dpdp-platform/frontend/src/fiduciary/lib/data-sources-api.ts
- `seedDatabase()` --calls--> `openDb()`  [EXTRACTED]
  demo-company-server/src/seed/generate.ts → demo-company-server/src/db.ts
- `ecommerceRoutes()` --indirect_call--> `onlyGet()`  [INFERRED]
  demo-company-server/src/routes/ecommerce.ts → demo-company-server/src/methodGate.ts
- `marketingRoutes()` --indirect_call--> `onlyGet()`  [INFERRED]
  demo-company-server/src/routes/marketing.ts → demo-company-server/src/methodGate.ts

## Import Cycles
- None detected.

## Communities (164 total, 33 thin omitted)

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
Cohesion: 0.04
Nodes (49): devDependencies, eslint, eslint-config-prettier, eslint-plugin-prettier, jest, @nestjs/cli, @nestjs/schematics, @nestjs/testing (+41 more)

### Community 5 - "2. ARCHITECTURE"
Cohesion: 0.22
Nodes (9): 2.1 Tech stack (locked — do not substitute), 2.2 Machine setup — Linux Mint Cinnamon (run these exactly), 2.3 Ports (locked), 2.4 Folder structure, 2.5 Database schema — Prisma (source of truth), 2.6 Raw SQL Prisma cannot express (second migration), 2.7 docker-compose.yml and .env, 2.8 The sync pipeline (+1 more)

### Community 6 - "RetentionTab.tsx"
Cohesion: 0.03
Nodes (77): DataTable(), clickAction, columns, Row, CheckboxOption, CheckboxOptionProps, FieldShell(), FieldShellProps (+69 more)

### Community 7 - "Tasks"
Cohesion: 0.05
Nodes (36): DPDP Platform MVP 1 — Implementation Plan, File Structure, Global Constraints, Risks and rulings taken up front, Task 10: Demo dataset generator — 500 records, 327 people, and the traps, Task 11: RestApiConnector with a GET-only HTTP client, Task 12: Data-source CRUD and credential encryption, Task 13: Field mapping, purpose attachment and the data-minimisation warning (+28 more)

### Community 8 - "compilerOptions"
Cohesion: 0.06
Nodes (30): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+22 more)

### Community 9 - "TokenService"
Cohesion: 0.11
Nodes (7): IS_PUBLIC_KEY, JwtEmployeeGuard, Injectable, TenantMiddleware, Injectable, TokenService, Injectable

### Community 10 - "UpdateOrganizationDto"
Cohesion: 0.09
Nodes (19): ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional (+11 more)

### Community 11 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, format, lint, seed, seed:principals, start, start:debug (+6 more)

### Community 12 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 15 - "tenant.extension.ts"
Cohesion: 0.12
Nodes (21): ALL_SCOPED_MODEL_NAMES, buildModelOverrides(), lowerFirst(), mergeWhere(), OperationArgs, organizationCreateBlockedError(), PRIMARY_KEY_FIELDS, primaryKeyWhereFor() (+13 more)

### Community 17 - "SecurityMeasuresService"
Cohesion: 0.14
Nodes (11): SecurityMeasuresController, ApiTags, Body, Controller, Get, Param, Patch, Post (+3 more)

### Community 18 - "CryptoService"
Cohesion: 0.18
Nodes (8): CryptoModule, Module, CryptoService, InvalidEncryptionKeyError, MalformedCiphertextError, makeService(), VALID_KEY_B64, Injectable

### Community 20 - "SettingsPage.tsx"
Cohesion: 0.06
Nodes (47): PermissionGate(), PermissionGateProps, Button, ButtonProps, buttonVariants, ExportButtons(), handleExport(), ExportDefinition (+39 more)

### Community 21 - "purposes.controller.ts"
Cohesion: 0.07
Nodes (31): CreatePurposeDto, ApiProperty, ApiPropertyOptional, IsArray, IsEnum, IsOptional, IsString, MinLength (+23 more)

### Community 24 - "api-client.ts"
Cohesion: 0.06
Nodes (27): EmptyState(), EmptyStateAction, EmptyStateProps, apiErrorMessage(), ReviewQueuePage(), API_BASE, ApiClient, ApiClientConfig (+19 more)

### Community 27 - "lib/auth.ts"
Cohesion: 0.15
Nodes (15): loginAs(), AuthStatus, bootstrapEmployeeSession(), bootstrapPrincipalSession(), employeeAuthStore, EmployeeSession, EmployeeSummary, fetchEmployeeMe() (+7 more)

### Community 28 - "data-sources.service.ts"
Cohesion: 0.08
Nodes (25): CONNECTOR_SOURCE_SELECT, DATA_SOURCE_FIELD_SELECT, DATA_SOURCE_PUBLIC_SELECT, PublicDataSource, PublicDataSourceField, TestConnectionResult, CreateDataSourceDto, ApiProperty (+17 more)

### Community 29 - "employees.controller.ts"
Cohesion: 0.08
Nodes (25): CreateEmployeeDto, ApiProperty, IsEmail, IsString, MinLength, ResetEmployeePasswordDto, ApiProperty, IsString (+17 more)

### Community 30 - "seed.ts"
Cohesion: 0.17
Nodes (10): DEMO_EMPLOYEES, main(), ALL_PERMISSION_CODES, ROLES, RoleSeed, runSeed(), seedDemoEmployees(), seedOrganization() (+2 more)

### Community 31 - "audit.e2e-spec.ts"
Cohesion: 0.29
Nodes (6): canonicalJson(), Custom, stringify(), typeLabel(), hashPayload(), verifyChainIntact()

### Community 32 - "ReviewQueuePage.test.tsx"
Cohesion: 0.47
Nodes (5): MatchCandidateListItem, CANDIDATE, jsonResponse(), loginAndRender(), MockRoutes

### Community 33 - "ListAuditEventsDto"
Cohesion: 0.17
Nodes (12): AUDIT_ACTIONS, AUDIT_EVENTS_PAGE_SIZE, ListAuditEventsDto, MAX_AUDIT_EVENTS_PAGE, IsIn, IsInt, IsOptional, IsString (+4 more)

### Community 34 - "demo-company-server/package.json"
Cohesion: 0.07
Nodes (26): better-sqlite3, dependencies, better-sqlite3, fastify, description, devDependencies, ts-node, @types/better-sqlite3 (+18 more)

### Community 35 - "AccessTokenPayload"
Cohesion: 0.08
Nodes (26): CurrentActor, CurrentActorPermissions, PERMISSION_KEY, PermissionsGuard, PermissionsRequest, Injectable, AccessTokenPayload, CandidatesController (+18 more)

### Community 36 - "PrincipalDetailPage.test.tsx"
Cohesion: 0.29
Nodes (7): AttributedValue(), DETAIL_RESPONSE, jsonResponse(), loginAndRender(), MockRoutes, RECIPIENTS_RESPONSE, SOURCE_RECORDS_RESPONSE

### Community 37 - "rest-api.connector.ts"
Cohesion: 0.15
Nodes (11): DecodedCursor, extractRecords(), inferType(), InvalidCursorError, isIsoDateString(), PageCapExceededError, RestApiConnectorConfig, SAMPLE_TRUNCATE_LENGTH (+3 more)

### Community 38 - "principals.service.ts"
Cohesion: 0.11
Nodes (18): DATA_CATEGORY_ORDER, MeDataCategoryGroup, MeDataValue, pickDisplayName(), resolveProvenance(), SourceRef, LineageService, PRINCIPAL_FIELD_SELECT (+10 more)

### Community 39 - "DataSourceNewPage.test.tsx"
Cohesion: 0.32
Nodes (6): DataSourceNewPage(), ATTACHED_PURPOSE, CREATED_DATA_SOURCE, jsonResponse(), loginAndRenderWizard(), renderWizard()

### Community 40 - ".record"
Cohesion: 0.08
Nodes (29): assertNoForbiddenMetadata(), ScopedTransactionClient, AgeService, Injectable, AssemblyService, Injectable, IdentifierLockSignal, lockIdentifiersForOwnership() (+21 more)

### Community 41 - "EmployeesPage.tsx"
Cohesion: 0.08
Nodes (40): Card, CardContent, CardDescription, CardHeader, CardTitle, Label, GAP_RESOLUTION_LINK, GapsPanel() (+32 more)

### Community 42 - "server.ts"
Cohesion: 0.30
Nodes (15): requireBearer(), System, SYSTEM_KEYS, openDb(), onlyGet(), envelope(), PageParams, parsePageParams() (+7 more)

### Community 43 - "SecurityMeasuresTab.tsx"
Cohesion: 0.11
Nodes (29): DataTableProps, EmptyStateConfig, Skeleton(), Input, InputProps, Table, TableBody, TableCell (+21 more)

### Community 44 - "CreateSharingActivityDto"
Cohesion: 0.06
Nodes (34): CreateSharingActivityDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum (+26 more)

### Community 45 - "tenant-context.ts"
Cohesion: 0.08
Nodes (27): AuditAction, NOTE: the spec's §4.7 prose claims "33 MVP 1 action names", but the, AuditRecordInput, storage, TenantContext, TenantStore, getDummyHash(), EmployeeLoginResult (+19 more)

### Community 47 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 48 - "exclude"
Cohesion: 0.17
Nodes (11): compilerOptions, noEmit, outDir, rootDir, exclude, extends, ../dist, ../node_modules (+3 more)

### Community 49 - "RequirePermission"
Cohesion: 0.15
Nodes (11): Delete, RequirePermission(), DataSourcesController, ApiTags, Body, Controller, Get, HttpCode (+3 more)

### Community 50 - "PrincipalAuthService"
Cohesion: 0.20
Nodes (4): EmployeeAuthService, Injectable, PrincipalAuthService, Injectable

### Community 51 - "seed-principals.ts"
Cohesion: 0.29
Nodes (10): DEMO_ORG, DEMO_PASSWORD, DemoEmployeeSeed, claimDemoPrincipalAccounts(), ClaimResult, DEMO_PRINCIPALS_TO_CLAIM, DemoPrincipalToClaim, main() (+2 more)

### Community 52 - "router.test.tsx"
Cohesion: 0.13
Nodes (11): principalLogout(), queryClient, rootElement, AppRouter(), EMPLOYEES, FUTURE, installFetchMock(), jsonResponse() (+3 more)

### Community 53 - "HealthService"
Cohesion: 0.14
Nodes (12): ApiServiceUnavailableResponse, HealthController, ApiOkResponse, ApiTags, Controller, Get, HttpCode, HealthModule (+4 more)

### Community 54 - "mappings.service.ts"
Cohesion: 0.21
Nodes (10): computeMappingWarnings(), MappingWarning, MappingWarningPurposeSummary, duplicateSourceFieldMessage(), isUniqueConstraintViolation(), MappingsService, PublicSourceFieldMapping, ReplaceMappingsResult (+2 more)

### Community 55 - "generate.ts"
Cohesion: 0.09
Nodes (23): ACCOUNT_STATUSES, Built, CAMPAIGN_SOURCES, CITY_POOL, EMAIL_FIELD, FIRST_NAMES, LAST_NAMES, PHONE_FIELD (+15 more)

### Community 56 - "backend/package.json"
Cohesion: 0.25
Nodes (7): description, license, name, prisma, seed, private, version

### Community 57 - "security-measures.service.ts"
Cohesion: 0.10
Nodes (22): CreateSecurityMeasureDto, SECURITY_MEASURE_TYPES, SECURITY_RULE_REFERENCES, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsIn (+14 more)

### Community 58 - "seed/permissions.ts"
Cohesion: 0.23
Nodes (8): PERMISSIONS, PermissionSeed, createOrgWithSettingsManager(), ensurePermission(), createOrgWithManager(), ensurePermission(), createOrgWithEmployee(), ensurePermission()

### Community 59 - "demo-company-server"
Cohesion: 0.18
Nodes (10): Access log, demo-company-server, Demo dataset (`npm run seed`), Endpoints — copy-paste table, Field names (deliberately messy — do not "fix" them), Personas, Running, Schema (+2 more)

### Community 60 - "UpdateRolePermissionsDto"
Cohesion: 0.13
Nodes (12): ApiProperty, ArrayUnique, IsArray, IsString, UpdateRolePermissionsDto, RolesController, ApiTags, Body (+4 more)

### Community 61 - "dependencies"
Cohesion: 0.13
Nodes (15): argon2, dependencies, argon2, ioredis, @nestjs/common, @nestjs/platform-express, pino-pretty, prisma (+7 more)

### Community 62 - "4. REQUIREMENTS"
Cohesion: 0.22
Nodes (9): 4.1 Tenancy, auth and permissions (SE-02, GO-04), 4.2 Connector layer, 4.3 Purposes and lawful basis (LB-01, LB-02, CN-02), 4.4 Normalization and identity resolution (GO-03), 4.5 API surface (MVP 1), 4.6 Frontend pages (MVP 1), 4.7 Audit requirements, 4.8 The demo company server (+1 more)

### Community 63 - "devDependencies"
Cohesion: 0.07
Nodes (29): autoprefixer, devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-refresh, jsdom, postcss (+21 more)

### Community 64 - "DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING"
Cohesion: 0.29
Nodes (6): 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 1 GOAL (definition of done), DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING, Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every feature here exists to satisfy a checklist ID., Self-contained build document. Paste this entire file as your vibe-coding prompt.

### Community 65 - "source-purposes.service.ts"
Cohesion: 0.24
Nodes (9): AttachPurposesDto, ApiProperty, ArrayUnique, IsArray, IsString, DataSourcePurposesResult, ReplacePurposesResult, PublicPurpose (+1 more)

### Community 66 - ".me"
Cohesion: 0.33
Nodes (5): EmployeeMeResponseDto, EmployeeMeRoleDto, ApiProperty, ApiOkResponse, Get

### Community 67 - "1. IDEA CONTEXT (read this first)"
Cohesion: 0.50
Nodes (4): 1. IDEA CONTEXT (read this first), Non-negotiable project rules (apply to BOTH MVPs), The DPDP concepts you need, in plain language, What MVP 1 delivers when done

### Community 68 - "MVP1 Evaluation Against Spec Section 6"
Cohesion: 0.07
Nodes (28): Check 10: Conflicts are surfaced, not silently resolved (GO-03), Check 11: Purpose and lawful basis are never inferred (LB-02), Check 12: The registers actually answer s.11(1)(b) (RT-04), Check 13: A processor cannot go live without a contract (GO-02), Check 14: Credentials are encrypted and never leave the backend, Check 15: The access log records who looked at whom (SE-03, SE-05), Check 16: The audit log cannot be edited, Check 17: Sequence has no gaps (+20 more)

### Community 69 - "read-only-http.client.ts"
Cohesion: 0.22
Nodes (9): defaultSleep(), ReadOnlyHttpClient, ReadOnlyHttpMethodError, ReadOnlyHttpRequestOptions, ReadOnlyHttpResponse, ReadOnlyHttpStatusError, ReadOnlyHttpTimeoutError, RETRY_BACKOFF_MS (+1 more)

### Community 70 - "DataSourcesService"
Cohesion: 0.31
Nodes (4): DataSourcesService, duplicateNameMessage(), isUniqueConstraintViolation(), Injectable

### Community 71 - "EmployeeAuthController"
Cohesion: 0.16
Nodes (13): EmployeeLoginDto, ApiProperty, IsEmail, IsString, MinLength, EmployeeAuthController, ApiTags, Body (+5 more)

### Community 73 - "mappings.e2e-spec.ts"
Cohesion: 0.24
Nodes (4): createEmployee(), createOrg(), createOrgWithBothPermissions(), ensurePermission()

### Community 74 - "DashboardPage.test.tsx"
Cohesion: 0.18
Nodes (13): GapsPanelProps, DashboardPage(), InventoryGap, InventorySummary, BASE_SUMMARY, FORBIDDEN_CLAIM_PATTERNS, jsonResponse(), loginAndRender() (+5 more)

### Community 75 - "CreateTransferDto"
Cohesion: 0.06
Nodes (31): CreateTransferDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional (+23 more)

### Community 76 - "router.tsx"
Cohesion: 0.08
Nodes (29): AppShell(), NAV_ITEMS, OrganizationSummary, DateTime(), DateTimeProps, OrgTimezoneContext, OrgTimezoneProvider, useOrgTimezone() (+21 more)

### Community 77 - "recipients.service.ts"
Cohesion: 0.06
Nodes (33): CreateRecipientDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional (+25 more)

### Community 78 - "merge.service.ts"
Cohesion: 0.08
Nodes (22): TenantScopedPrismaClient, allocateCounterValue(), AUDIT_COUNTER_NAME, ReferenceModule, Module, ReferenceService, Injectable, ApiProperty (+14 more)

### Community 79 - "CreateRetentionPolicyDto"
Cohesion: 0.06
Nodes (34): CreateRetentionPolicyDto, RETENTION_LEGAL_BASIS_TYPES, RETENTION_TRIGGER_TYPES, RETENTION_UNITS, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn (+26 more)

### Community 80 - "mapping-warnings.ts"
Cohesion: 0.29
Nodes (8): MappingWarningPurposeSummaryResponseDto, MappingWarningResponseDto, ApiProperty, MappingsResponseDto, SourceFieldMappingResponseDto, ApiProperty, MappingForWarningCheck, MappingWarningType

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
Cohesion: 0.21
Nodes (6): RECONCILE_BOOT_TIMEOUT_MS, ScheduleReconciliationService, Injectable, SyncQueueService, syncSchedulerId(), Injectable

### Community 85 - "app.module.ts"
Cohesion: 0.09
Nodes (30): AuditModule, Module, MaskingModule, Module, TenantModule, Module, AuditReadModule, Module (+22 more)

### Community 86 - "inventory.service.ts"
Cohesion: 0.27
Nodes (7): CAN_VIEW_ALL_PERSONAL_DATA, PASS_THROUGH_FIELDS, InventoryGap, InventorySummary, NON_PERSONAL_DATA_CANONICAL_FIELDS, RecentAuditEvent, ShortfallCounts

### Community 88 - "PrincipalAuthController"
Cohesion: 0.25
Nodes (8): PrincipalAuthController, ApiTags, Body, Controller, HttpCode, Post, Req, Res

### Community 89 - "AuditReadController"
Cohesion: 0.28
Nodes (6): AuditReadController, ApiTags, Controller, Get, Query, Res

### Community 90 - "principal-portal.e2e-spec.ts"
Cohesion: 0.31
Nodes (8): PURPOSE_NOT_CONFIGURED, createFixture(), createPrincipal(), createSource(), EmployeeSession, ensurePermission(), Fixture, PrincipalSession

### Community 91 - "sync.e2e-spec.ts"
Cohesion: 0.13
Nodes (15): SyncCounts, SyncRunSummary, SyncProcessor, FREQUENCY_CRON_PATTERNS, SYNC_QUEUE_NAME, SYNC_SCHEDULE_TRIGGERED_BY, SYNC_WORKER_CONCURRENCY, SyncJobData (+7 more)

### Community 93 - "ListPrincipalsDto"
Cohesion: 0.25
Nodes (8): ListPrincipalsDto, IsEnum, IsInt, IsOptional, IsString, Max, Min, Transform

### Community 94 - "PermissionsController"
Cohesion: 0.33
Nodes (4): PermissionsController, ApiTags, Controller, Get

### Community 96 - "2. ARCHITECTURE"
Cohesion: 0.33
Nodes (6): 2.1 New packages (everything from MVP 1 stays), 2.2 New Prisma models (all MVP 1 models unchanged), 2.3 Raw SQL follow-up migration, 2.4 Seeded compliance rules — defaults for a DPO to review, not legal advice, 2.5 Background jobs (added to the MVP 1 BullMQ setup), 2. ARCHITECTURE

### Community 97 - "compilerOptions"
Cohesion: 0.07
Nodes (29): compilerOptions, allowImportingTsExtensions, baseUrl, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+21 more)

### Community 98 - "assembly.service.ts"
Cohesion: 0.11
Nodes (22): ageStatusFor(), compareNewest(), DobCandidate, AssembledField, assembleFields(), AssemblyMapping, AssemblyRecord, compareNewest() (+14 more)

### Community 100 - "SyncPipelineService"
Cohesion: 0.13
Nodes (13): describeSyncError(), MESSAGE_SAFE_ERROR_CLASSES, MissingRecordKeyError, IdentifierOwnershipConflictError, NotFoundException, PageCapExceededError, SomeFutureDomainError, SyncErrorDescription (+5 more)

### Community 101 - "AuditPage.test.tsx"
Cohesion: 0.32
Nodes (7): AuditEventListItem, AuditEventListResult, AUDIT_EVENT, jsonResponse(), loginAndRenderThroughShell(), MockRoutes, ORGANIZATION

### Community 102 - "merge-unmerge.e2e-spec.ts"
Cohesion: 0.24
Nodes (10): activeLink(), attachIdentifier(), CandidateLoader, dataSource(), ensurePermission(), principal(), rebuild(), reviewerFor() (+2 more)

### Community 103 - "PrincipalDetailPage.tsx"
Cohesion: 0.07
Nodes (37): SourceChip(), SourceChipProps, Badge(), BadgeProps, badgeVariants, AGREEMENT_LABEL, CandidateComparison(), CandidateComparisonProps (+29 more)

### Community 104 - "PrismaModule"
Cohesion: 0.67
Nodes (3): PrismaModule, Module, Global

### Community 105 - "MappingsController"
Cohesion: 0.27
Nodes (8): MappingsController, ApiOkResponse, ApiTags, Body, Controller, Get, Param, Put

### Community 107 - "principals.e2e-spec.ts"
Cohesion: 0.18
Nodes (10): MAX_PRINCIPALS_PAGE, PRINCIPALS_PAGE_SIZE, buildPrincipalSearchQuery(), PrincipalSearchQueryParams, createFixture(), createPrincipal(), createSource(), EmployeeSession (+2 more)

### Community 108 - "createApiClient"
Cohesion: 0.48
Nodes (7): createApiClient(), buildInit(), onAuthExpired(), rawRequest(), refresh(), requestJson(), extractMessage()

### Community 109 - "data-sources.e2e-spec.ts"
Cohesion: 0.16
Nodes (10): DataSourceRowForConnector, jsonHandler(), MockHttpServer, createManager(), createOrgWithRole(), ensurePermission(), startRecordsServer(), startRecordsServer() (+2 more)

### Community 110 - "DataSourceDetailPage.tsx"
Cohesion: 0.05
Nodes (65): Tabs, TabsContent, TabsList, TabsTrigger, errorLogEntries(), STATUS_VARIANT, SyncHistoryTable(), SyncHistoryTableProps (+57 more)

### Community 111 - "queues.module.ts"
Cohesion: 0.11
Nodes (13): AppConfig, BigInt, QueuesModule, Module, toRedisConnectionOptions(), lockKey(), SYNC_LOCK_HEARTBEAT_INTERVAL_MS, SYNC_LOCK_PREFIX (+5 more)

### Community 112 - "csv-writer.ts"
Cohesion: 0.39
Nodes (6): csvDocument(), csvField(), csvRow(), needsQuoting(), RFC-4180, RFC-4180

### Community 113 - "registers.e2e-spec.ts"
Cohesion: 0.39
Nodes (8): authed(), createDataSource(), createEmployeeWithPermissions(), createOrgWithManager(), createPurpose(), createRecipient(), ensurePermission(), recipientPayload()

### Community 114 - "matching.service.ts"
Cohesion: 0.06
Nodes (42): customerIdSignal(), hasSoleVerifiedCustomerIdMapping(), verifiedCustomerIdValue(), emailSignal(), phoneSignal(), lastSix(), sameDate(), SCORE_BY_SIGNAL (+34 more)

### Community 115 - "EmployeesPage.test.tsx"
Cohesion: 0.22
Nodes (9): DemoCredentialsBanner(), shouldShowDemoCredentials(), EMPLOYEES, jsonResponse(), loginAndRenderThroughShell(), LoginOptions, ORGANIZATION, PatchEmployeeStatusBox (+1 more)

### Community 116 - "ReplaceMappingsDto"
Cohesion: 0.17
Nodes (12): ReplaceMappingsDto, SourceFieldMappingDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsEnum, IsOptional (+4 more)

### Community 119 - "evaluate-mvp1.sh"
Cohesion: 0.39
Nodes (8): attach_purpose(), auth(), create_purpose(), create_source(), map_source(), NVM_DIR, evaluate-mvp1.sh script, sync_and_wait()

### Community 120 - "routes.test.ts"
Cohesion: 0.25
Nodes (7): closeDb(), { buildServer }, EXPECTED_FIELDS, KEYS, { openDb, closeDb }, ROUTES, TEST_DB_PATH

### Community 122 - "purposes-response.dto.ts"
Cohesion: 0.50
Nodes (4): DataSourcePurposeResponseDto, DataSourcePurposesResponseDto, ApiProperty, ApiPropertyOptional

### Community 123 - "dependencies"
Cohesion: 0.06
Nodes (31): class-variance-authority, clsx, dependencies, class-variance-authority, clsx, @hookform/resolvers, lucide-react, papaparse (+23 more)

### Community 124 - "RecipientsTab.test.tsx"
Cohesion: 0.33
Nodes (6): RecipientsTab(), jsonResponse(), loginAndRender(), RouteHooks, toastError, toastSuccess

### Community 125 - "SettingsPage.test.tsx"
Cohesion: 0.40
Nodes (5): SettingsPage(), BASE_ORGANIZATION, jsonResponse(), loginAndRenderThroughShell(), MockRoutes

### Community 126 - "DataSourceDetailPage.test.tsx"
Cohesion: 0.38
Nodes (6): DataSourceDetailPage(), DATA_SOURCE, jsonResponse(), loginAndRenderDetailPage(), ORDER_FULFILMENT_PURPOSE, renderDetailPage()

### Community 127 - "inventory.e2e-spec.ts"
Cohesion: 0.40
Nodes (3): EmployeeSession, ensurePermission(), Fixture

### Community 129 - "audit-read.service.ts"
Cohesion: 0.17
Nodes (10): ACCESS_LOG_CSV_HEADER, AUDIT_EVENT_LIST_SELECT, AuditEventListItem, AuditEventListResult, AuditEventListRow, AuditReadService, Injectable, AccessLogExportDto (+2 more)

### Community 131 - "PrismaService"
Cohesion: 0.05
Nodes (25): AccessLogService, RecordPersonalDataViewedInput, Injectable, AuditService, FORBIDDEN_METADATA_KEY_FRAGMENTS, Injectable, extendWithTenantScoping(), PrismaService (+17 more)

### Community 132 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include (+1 more)

### Community 134 - "connector.factory.ts"
Cohesion: 0.20
Nodes (5): ConnectorFactory, Injectable, Connector, ConnectorsModule, Module

### Community 136 - "InventoryService"
Cohesion: 0.19
Nodes (7): InventoryController, ApiTags, Controller, Get, Res, InventoryService, Injectable

### Community 137 - "sync.service.ts"
Cohesion: 0.09
Nodes (21): DEFAULT_SYNC_JOB_LIST_LIMIT, ListSyncJobsQueryDto, MAX_SYNC_JOB_LIST_LIMIT, IsInt, IsOptional, IsString, Max, Min (+13 more)

### Community 142 - "employeeLogin"
Cohesion: 0.19
Nodes (13): jsonResponse(), loginAndRender(), MockRoutes, SOURCE_RECORDS_RESPONSE, jsonResponse(), LIST_RESPONSE, loginAndRender(), Routes (+5 more)

### Community 144 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, preview, test, test:watch, typecheck

### Community 146 - "PrincipalLoginDto"
Cohesion: 0.33
Nodes (5): PrincipalLoginDto, ApiProperty, IsEmail, IsString, MinLength

### Community 147 - "frontend/package.json"
Cohesion: 0.29
Nodes (6): description, license, name, private, type, version

### Community 148 - "configuration.ts"
Cohesion: 0.20
Nodes (10): ACCESS_LOG_RETENTION_FLOOR_DAYS, EnvironmentVariables, IsIn, IsInt, IsNotEmpty, IsString, Min, MinLength (+2 more)

### Community 168 - "Public"
Cohesion: 0.10
Nodes (20): ApiExtraModels, CurrentPrincipal, Public(), JwtPrincipalGuard, PrincipalActor, Injectable, Get, UseGuards (+12 more)

### Community 180 - "PrincipalsController"
Cohesion: 0.18
Nodes (6): PrincipalsController, ApiTags, Controller, Get, Param, Query

## Knowledge Gaps
- **778 isolated node(s):** `name`, `version`, `private`, `description`, `main` (+773 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PrismaService` connect `PrismaService` to `audit-read.service.ts`, `InventoryService`, `TokenService`, `sync.service.ts`, `data-sources.service.ts`, `seed.ts`, `audit.e2e-spec.ts`, `AccessTokenPayload`, `principals.service.ts`, `Public`, `.record`, `CreateSharingActivityDto`, `tenant-context.ts`, `PrincipalAuthService`, `seed-principals.ts`, `mappings.service.ts`, `security-measures.service.ts`, `seed/permissions.ts`, `source-purposes.service.ts`, `mappings.e2e-spec.ts`, `CreateTransferDto`, `recipients.service.ts`, `merge.service.ts`, `SyncQueueService`, `inventory.service.ts`, `principal-portal.e2e-spec.ts`, `sync.e2e-spec.ts`, `AppModule`, `PermissionsController`, `assembly.service.ts`, `merge-unmerge.e2e-spec.ts`, `principals.e2e-spec.ts`, `data-sources.e2e-spec.ts`, `registers.e2e-spec.ts`, `inventory.e2e-spec.ts`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `RequirePermission()` connect `RequirePermission` to `audit-read.service.ts`, `PrismaService`, `InventoryService`, `sync.service.ts`, `UpdateOrganizationDto`, `SecurityMeasuresService`, `purposes.controller.ts`, `data-sources.service.ts`, `employees.controller.ts`, `AccessTokenPayload`, `principals.service.ts`, `CreateSharingActivityDto`, `PrincipalsController`, `security-measures.service.ts`, `UpdateRolePermissionsDto`, `source-purposes.service.ts`, `CreateTransferDto`, `recipients.service.ts`, `merge.service.ts`, `CreateRetentionPolicyDto`, `AuditReadController`, `PermissionsController`, `MappingsController`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `AuditService` connect `PrismaService` to `audit-read.service.ts`, `source-purposes.service.ts`, `assembly.service.ts`, `AccessTokenPayload`, `.record`, `CreateTransferDto`, `CreateSharingActivityDto`, `tenant-context.ts`, `merge.service.ts`, `recipients.service.ts`, `app.module.ts`, `mappings.service.ts`, `security-measures.service.ts`, `data-sources.service.ts`, `audit.e2e-spec.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _778 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Consent & Breach Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `DPDP Compliance Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._