# Graph Report - DPDP app  (2026-09-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 4385 nodes · 9490 edges · 214 communities (182 shown, 32 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 335 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `642c1dcb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Consent & Breach Checklist
- DPDP Compliance Checklist
- 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)
- 4. REQUIREMENTS
- devDependencies
- 2. ARCHITECTURE
- PrincipalDetailPage.tsx
- Tasks
- compilerOptions
- SettingsPage.tsx
- UpdateOrganizationDto
- scripts
- nest-cli.json
- jest.config.ts
- tenant.extension.ts
- security-measures.service.ts
- CryptoService
- dependencies
- card.tsx
- requests.service.ts
- jsonwebtoken
- @nestjs/config
- erasure-task.service.ts
- CreateVoluntaryUndertakingDto
- campaigns.service.ts
- cn
- data-sources.service.ts
- employees.controller.ts
- CreateInformationRequestDto
- principals.e2e-spec.ts
- RequestsService
- CampaignsService
- demo-company-server/package.json
- RecipientsService
- mappings.service.ts
- DashboardPage.test.tsx
- principals.service.ts
- registers.module.ts
- normalization.service.ts
- EmployeesPage.tsx
- server.ts
- SecurityMeasuresTab.tsx
- SharingService
- DateTime.tsx
- ConsentsService
- compilerOptions
- exclude
- DataSourcesController
- BootRegistrationRegistry
- age-status.service.ts
- notices.service.ts
- HealthService
- retention/retention.controller.ts
- generate.ts
- backend/package.json
- child-exemptions.service.ts
- rest-api.connector.ts
- demo-company-server
- audit.service.ts
- sdf-assessment.service.ts
- 4. REQUIREMENTS
- devDependencies
- DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING
- CandidateComparison.tsx
- compliance.service.ts
- 1. IDEA CONTEXT (read this first)
- MVP1 Evaluation Against Spec Section 6
- employee-auth.service.ts
- UpdateRolePermissionsDto
- EmployeeAuthController
- read-only-http.client.ts
- AppModule
- PermissionsGuard
- CreateTransferDto
- api-client.ts
- recipients.service.ts
- prisma.service.ts
- RetentionService
- access-report-render.ts
- DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS
- dataset.test.ts
- generateDataset
- retention.service.ts
- CreateNoticeVersionDto
- CreateComplianceRuleDto
- Rng
- PrincipalAuthController
- ScopedTransactionClient
- CreateSdfAssessmentDto
- sync.e2e-spec.ts
- mappings.controller.ts
- connector.factory.ts
- seed.ts
- DPDP Platform MVP 2 — Compliance Operations — Implementation Plan
- 2. ARCHITECTURE
- compilerOptions
- assembly.service.ts
- ImportConsentDto
- SyncPipelineService
- sdf.module.ts
- merge-unmerge.e2e-spec.ts
- DeadlineScanProcessor
- NotificationsService
- retention.module.ts
- main.ts
- access-report.service.ts
- campaign-send.processor.ts
- RetentionScanService
- DataSourceDetailPage.tsx
- queues.module.ts
- csvDocument
- seed-principals.ts
- .setStatus
- requests.controller.ts
- template-renderer.ts
- .record
- retention.e2e-spec.ts
- evaluate-mvp1.sh
- routes.test.ts
- .unmerge
- Waves and Tasks
- dependencies
- legal-hold.service.ts
- TenantModule
- Public
- principal-portal.e2e-spec.ts
- ComplianceController
- PDFDocument
- TokenService
- NotificationBell.tsx
- compilerOptions
- cookie-parser
- SyncQueueService
- Wave 1 — Engines (4 parallel + integrator)
- InventoryService
- sync.service.ts
- date-fns-tz
- @nestjs/bullmq
- nestjs-pino
- Wave 2 — Domain services, part one (4 parallel + integrator)
- UpdateAlgorithmEntryDto
- Wave 3 — Domain services, part two (4 parallel + integrator)
- scripts
- SdfController
- DataSourcesService
- frontend/package.json
- MaskingService
- AccessTokenPayload
- Wave 6 — Frontend, part one (4 parallel + integrator)
- Wave 7 — Frontend, part two (4 parallel + integrator)
- handlebars
- eslint-plugin-react-hooks
- notifications.module.ts
- PrincipalLoginDto
- vite-env.d.ts
- UpdateComplianceRuleDto
- typescript-eslint
- @radix-ui/react-dialog
- vitest
- LineageService
- templates.service.ts
- CreateSharingActivityDto
- data-sources.e2e-spec.ts
- registers.e2e-spec.ts
- Wave 4 — Breach and the remaining jobs (2 parallel + integrator)
- CreateAlgorithmEntryDto
- zod
- zip-writer.ts
- ts-node
- PrincipalEvidenceService
- canonicalJson
- EnvironmentVariables
- app.module.ts
- prettier
- ListRequestsDto
- audit-read.service.ts
- masking.service.ts
- tsconfig-paths
- PrismaService
- csv-writer.ts
- @types/node
- @types/nodemailer
- SetMyConsentDto
- CreateRetentionPolicyDto
- PrincipalsService
- @hookform/resolvers
- @radix-ui/react-tooltip
- react
- react-hook-form
- @tanstack/react-query
- @testing-library/jest-dom
- AccessReportService
- TemplatesService
- compile-audience.ts
- CandidatesService
- ListPrincipalsDto
- RequirePermission
- AddNoteDto
- ChangeStatusDto
- ConsentBackfillService
- VerifyIdentityDto
- PrismaModule
- RequestsController
- EvidencePackController
- guardians.service.ts

## God Nodes (most connected - your core abstractions)
1. `PrismaService` - 179 edges
2. `RequirePermission()` - 168 edges
3. `AuditService` - 94 edges
4. `cn()` - 64 edges
5. `AccessTokenPayload` - 60 edges
6. `ScopedTransactionClient` - 53 edges
7. `TenantContext` - 41 edges
8. `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` - 37 edges
9. `Button` - 34 edges
10. `humanizeEnum()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `TestApp` --references--> `PrismaService`  [EXTRACTED]
  dpdp-platform/backend/test/support/e2e-harness.ts → dpdp-platform/backend/src/common/prisma/prisma.service.ts
- `renderAccessReportCsv()` --calls--> `csvDocument()`  [EXTRACTED]
  dpdp-platform/backend/src/modules/evidence/access-report-render.ts → dpdp-platform/backend/src/modules/inventory/csv-writer.ts
- `NotificationRow()` --calls--> `cn()`  [EXTRACTED]
  dpdp-platform/frontend/src/components/shared/NotificationBell.tsx → dpdp-platform/frontend/src/lib/utils.ts
- `TransferForm()` --calls--> `useEmployeeAuth()`  [EXTRACTED]
  dpdp-platform/frontend/src/fiduciary/components/registers/TransfersTab.tsx → dpdp-platform/frontend/src/lib/auth.ts
- `AccessReportData` --references--> `ResolvedPrincipalField`  [EXTRACTED]
  dpdp-platform/backend/src/modules/evidence/access-report.service.ts → dpdp-platform/backend/src/modules/principals/lineage.service.ts

## Import Cycles
- None detected.

## Communities (214 total, 32 thin omitted)

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
Cohesion: 0.05
Nodes (41): devDependencies, eslint, eslint-config-prettier, eslint-plugin-prettier, jest, @nestjs/cli, @nestjs/schematics, @nestjs/testing (+33 more)

### Community 5 - "2. ARCHITECTURE"
Cohesion: 0.22
Nodes (9): 2.1 Tech stack (locked — do not substitute), 2.2 Machine setup — Linux Mint Cinnamon (run these exactly), 2.3 Ports (locked), 2.4 Folder structure, 2.5 Database schema — Prisma (source of truth), 2.6 Raw SQL Prisma cannot express (second migration), 2.7 docker-compose.yml and .env, 2.8 The sync pipeline (+1 more)

### Community 6 - "PrincipalDetailPage.tsx"
Cohesion: 0.05
Nodes (50): BADGE_VARIANT, Band, bandFor(), DeadlinePill(), DeadlinePillProps, UnreviewedRuleChip(), UnreviewedRuleChipProps, Badge() (+42 more)

### Community 7 - "Tasks"
Cohesion: 0.05
Nodes (36): DPDP Platform MVP 1 — Implementation Plan, File Structure, Global Constraints, Risks and rulings taken up front, Task 10: Demo dataset generator — 500 records, 327 people, and the traps, Task 11: RestApiConnector with a GET-only HTTP client, Task 12: Data-source CRUD and credential encryption, Task 13: Field mapping, purpose attachment and the data-minimisation warning (+28 more)

### Community 8 - "compilerOptions"
Cohesion: 0.06
Nodes (30): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+22 more)

### Community 9 - "SettingsPage.tsx"
Cohesion: 0.10
Nodes (25): SelectControl, describeSaveError(), SdfDeclarationCard(), SdfDeclarationCardProps, SdfDeclarationFields, sdfFormSchema, SdfFormValues, ORGANIZATION (+17 more)

### Community 10 - "UpdateOrganizationDto"
Cohesion: 0.09
Nodes (19): ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsObject (+11 more)

### Community 11 - "scripts"
Cohesion: 0.14
Nodes (14): scripts, build, format, lint, seed, seed:principals, start, start:debug (+6 more)

### Community 12 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 15 - "tenant.extension.ts"
Cohesion: 0.12
Nodes (21): ALL_SCOPED_MODEL_NAMES, buildModelOverrides(), lowerFirst(), mergeWhere(), OperationArgs, organizationCreateBlockedError(), PRIMARY_KEY_FIELDS, primaryKeyWhereFor() (+13 more)

### Community 17 - "security-measures.service.ts"
Cohesion: 0.07
Nodes (33): CreateSecurityMeasureDto, SECURITY_MEASURE_TYPES, SECURITY_RULE_REFERENCES, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsIn (+25 more)

### Community 18 - "CryptoService"
Cohesion: 0.20
Nodes (8): CryptoModule, Module, CryptoService, InvalidEncryptionKeyError, MalformedCiphertextError, makeService(), VALID_KEY_B64, Injectable

### Community 19 - "dependencies"
Cohesion: 0.05
Nodes (39): argon2, bullmq, class-transformer, class-validator, dependencies, argon2, bullmq, class-transformer (+31 more)

### Community 20 - "card.tsx"
Cohesion: 0.05
Nodes (43): Skeleton(), Card, CardContent, CardDescription, CardHeader, CardTitle, RecentAuditStripProps, StatCardProps (+35 more)

### Community 21 - "requests.service.ts"
Cohesion: 0.14
Nodes (16): APPLIES_TO_BY_REQUEST_TYPE, DEADLINE_SCAN_ACTOR_LABEL, DEADLINE_WARNING_EVENT_NOTE, ERASURE_STATUTORY_GROUND_TEXT, ERASURE_STATUTORY_GROUNDS, ErasureStatutoryGround, REJECTION_REASON_MIN_LENGTH, TERMINAL_REQUEST_STATUSES (+8 more)

### Community 24 - "erasure-task.service.ts"
Cohesion: 0.13
Nodes (14): ProcessorChecklistEntry, SystemChecklistEntry, ACCOUNT_ACCESS_CANONICAL_FIELDS, ERASURE_TASK_PUBLIC_SELECT, ErasureTaskService, ErasureTrigger, PublicErasureTask, TERMINAL_STATES (+6 more)

### Community 25 - "CreateVoluntaryUndertakingDto"
Cohesion: 0.05
Nodes (40): CreateVoluntaryUndertakingDto, ApiProperty, ApiPropertyOptional, IsArray, IsDateString, IsOptional, IsString, MinLength (+32 more)

### Community 26 - "campaigns.service.ts"
Cohesion: 0.09
Nodes (22): ActiveNonDisclosureDirection, recordNonDisclosureSuppression(), CAMPAIGN_PUBLIC_SELECT, CAMPAIGN_RECIPIENT_PUBLIC_SELECT, CHILD_LIKE_AGE_STATUSES, COMPLIANCE_CATEGORIES, PublicCampaign, PublicCampaignRecipient (+14 more)

### Community 27 - "cn"
Cohesion: 0.03
Nodes (89): ConfirmDialogProps, LanguageSelectorProps, NOTICE_LANGUAGES, NoticeLanguageCode, Button, ButtonProps, buttonVariants, Checkbox (+81 more)

### Community 28 - "data-sources.service.ts"
Cohesion: 0.08
Nodes (25): CONNECTOR_SOURCE_SELECT, DATA_SOURCE_FIELD_SELECT, DATA_SOURCE_PUBLIC_SELECT, PublicDataSource, PublicDataSourceField, TestConnectionResult, CreateDataSourceDto, ApiProperty (+17 more)

### Community 29 - "employees.controller.ts"
Cohesion: 0.08
Nodes (25): CreateEmployeeDto, ApiProperty, IsEmail, IsString, MinLength, ResetEmployeePasswordDto, ApiProperty, IsString (+17 more)

### Community 30 - "CreateInformationRequestDto"
Cohesion: 0.06
Nodes (33): CreateInformationRequestDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn (+25 more)

### Community 31 - "principals.e2e-spec.ts"
Cohesion: 0.23
Nodes (8): MAX_PRINCIPALS_PAGE, PRINCIPALS_PAGE_SIZE, createFixture(), createPrincipal(), createSource(), EmployeeSession, ensurePermission(), Fixture

### Community 32 - "RequestsService"
Cohesion: 0.35
Nodes (3): RequestsService, transitionTargets(), Injectable

### Community 33 - "CampaignsService"
Cohesion: 0.22
Nodes (4): CampaignsService, notFoundCampaign(), toBadRequest(), Injectable

### Community 34 - "demo-company-server/package.json"
Cohesion: 0.07
Nodes (26): better-sqlite3, dependencies, better-sqlite3, fastify, description, devDependencies, ts-node, @types/better-sqlite3 (+18 more)

### Community 35 - "RecipientsService"
Cohesion: 0.13
Nodes (12): RecipientsController, ApiTags, Body, Controller, Get, Param, Patch, Post (+4 more)

### Community 36 - "mappings.service.ts"
Cohesion: 0.14
Nodes (16): computeMappingWarnings(), MappingForWarningCheck, MappingWarning, MappingWarningPurposeSummary, duplicateSourceFieldMessage(), isUniqueConstraintViolation(), MappingsService, PublicSourceFieldMapping (+8 more)

### Community 37 - "DashboardPage.test.tsx"
Cohesion: 0.14
Nodes (18): GAP_RESOLUTION_LINK, GapsPanel(), GapsPanelProps, RecentAuditStrip(), StatCard(), StatCardSkeleton(), DashboardPage(), InventoryGap (+10 more)

### Community 38 - "principals.service.ts"
Cohesion: 0.16
Nodes (14): DATA_CATEGORY_ORDER, MeDataCategoryGroup, MeDataValue, pickDisplayName(), resolveProvenance(), SourceRef, PRINCIPAL_FIELD_SELECT, ResolvedPrincipalField (+6 more)

### Community 39 - "registers.module.ts"
Cohesion: 0.13
Nodes (14): ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsString, MinLength (+6 more)

### Community 40 - "normalization.service.ts"
Cohesion: 0.11
Nodes (19): NormalizationModule, Module, asPayload(), copyJson(), NormalizationService, NormalizationSourceRecord, NormalizedRecordInput, nullableString() (+11 more)

### Community 41 - "EmployeesPage.tsx"
Cohesion: 0.09
Nodes (30): PermissionGate(), PermissionGateProps, SourceChip(), SourceChipProps, ExportButtons(), handleExport(), ExportDefinition, EXPORTS (+22 more)

### Community 42 - "server.ts"
Cohesion: 0.30
Nodes (15): requireBearer(), System, SYSTEM_KEYS, openDb(), onlyGet(), envelope(), PageParams, parsePageParams() (+7 more)

### Community 43 - "SecurityMeasuresTab.tsx"
Cohesion: 0.07
Nodes (38): DataTableProps, EmptyStateConfig, EmptyState(), EmptyStateAction, EmptyStateProps, Table, TableBody, TableCell (+30 more)

### Community 44 - "SharingService"
Cohesion: 0.14
Nodes (11): SharingController, ApiTags, Body, Controller, Get, Param, Patch, Post (+3 more)

### Community 45 - "DateTime.tsx"
Cohesion: 0.10
Nodes (22): NAV_ITEMS, OrganizationSummary, DateTime(), DateTimeProps, OrgTimezoneContext, OrgTimezoneProvider, useOrgTimezone(), IS_LEGAL_BASIS (+14 more)

### Community 46 - "ConsentsService"
Cohesion: 0.12
Nodes (11): ConsentsController, ApiTags, Body, Controller, Get, Param, Post, Req (+3 more)

### Community 47 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 48 - "exclude"
Cohesion: 0.17
Nodes (11): compilerOptions, noEmit, outDir, rootDir, exclude, extends, ../dist, ../node_modules (+3 more)

### Community 49 - "DataSourcesController"
Cohesion: 0.15
Nodes (10): Delete, DataSourcesController, ApiTags, Body, Controller, Get, HttpCode, Param (+2 more)

### Community 50 - "BootRegistrationRegistry"
Cohesion: 0.11
Nodes (17): BootRegistration, BootRegistrationRegistry, Injectable, RECONCILE_BOOT_TIMEOUT_MS, withBootTimeout(), ConsentBackfillQueueService, Injectable, InjectQueue (+9 more)

### Community 51 - "age-status.service.ts"
Cohesion: 0.14
Nodes (13): AgeStatusController, ApiTags, Body, Controller, Get, Param, Post, AGE_STATUS_PUBLIC_SELECT (+5 more)

### Community 52 - "notices.service.ts"
Cohesion: 0.05
Nodes (40): CreateNoticeDto, ApiProperty, ArrayMinSize, ArrayUnique, IsArray, IsString, MinLength, ApiProperty (+32 more)

### Community 53 - "HealthService"
Cohesion: 0.14
Nodes (12): ApiServiceUnavailableResponse, HealthController, ApiOkResponse, ApiTags, Controller, Get, HttpCode, HealthModule (+4 more)

### Community 54 - "retention/retention.controller.ts"
Cohesion: 0.08
Nodes (26): CancelErasureTaskDto, ApiProperty, IsString, MinLength, CompleteErasureTaskDto, ProcessorChecklistTickDto, SystemChecklistTickDto, ApiProperty (+18 more)

### Community 55 - "generate.ts"
Cohesion: 0.09
Nodes (23): ACCOUNT_STATUSES, Built, CAMPAIGN_SOURCES, CITY_POOL, EMAIL_FIELD, FIRST_NAMES, LAST_NAMES, PHONE_FIELD (+15 more)

### Community 56 - "backend/package.json"
Cohesion: 0.25
Nodes (7): description, license, name, prisma, seed, private, version

### Community 57 - "child-exemptions.service.ts"
Cohesion: 0.09
Nodes (25): ChildExemptionsController, ApiTags, Body, Controller, Get, Post, Query, ChildExemptionsService (+17 more)

### Community 58 - "rest-api.connector.ts"
Cohesion: 0.13
Nodes (12): DecodedCursor, extractRecords(), inferType(), InvalidCursorError, isIsoDateString(), PageCapExceededError, RestApiConnector, RestApiConnectorConfig (+4 more)

### Community 59 - "demo-company-server"
Cohesion: 0.18
Nodes (10): Access log, demo-company-server, Demo dataset (`npm run seed`), Endpoints — copy-paste table, Field names (deliberately messy — do not "fix" them), Personas, Running, Schema (+2 more)

### Community 60 - "audit.service.ts"
Cohesion: 0.09
Nodes (22): AuditAction, AuditRecordInput, FORBIDDEN_METADATA_KEY_FRAGMENTS, allocateCounterValue(), AUDIT_COUNTER_NAME, ReferenceService, Injectable, INFORMATION_REQUEST_PUBLIC_SELECT (+14 more)

### Community 61 - "sdf-assessment.service.ts"
Cohesion: 0.11
Nodes (17): ALGORITHM_OPERATIONS, AlgorithmOperation, CompleteSdfAssessmentDto, ApiPropertyOptional, IsBoolean, IsDateString, IsOptional, IsString (+9 more)

### Community 62 - "4. REQUIREMENTS"
Cohesion: 0.22
Nodes (9): 4.1 Tenancy, auth and permissions (SE-02, GO-04), 4.2 Connector layer, 4.3 Purposes and lawful basis (LB-01, LB-02, CN-02), 4.4 Normalization and identity resolution (GO-03), 4.5 API surface (MVP 1), 4.6 Frontend pages (MVP 1), 4.7 Audit requirements, 4.8 The demo company server (+1 more)

### Community 63 - "devDependencies"
Cohesion: 0.06
Nodes (33): autoprefixer, devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-refresh, globals, jsdom (+25 more)

### Community 64 - "DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING"
Cohesion: 0.29
Nodes (6): 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 1 GOAL (definition of done), DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING, Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every feature here exists to satisfy a checklist ID., Self-contained build document. Paste this entire file as your vibe-coding prompt.

### Community 65 - "CandidateComparison.tsx"
Cohesion: 0.16
Nodes (15): AGREEMENT_LABEL, CandidateComparison(), CandidateComparisonProps, CandidateSignal, FIELD_LABELS, MatchCandidateListItem, SignalAgreement, signalBadgeVariant() (+7 more)

### Community 66 - "compliance.service.ts"
Cohesion: 0.20
Nodes (11): COMPLIANCE_RULE_PUBLIC_SELECT, ComplianceRuleRow, ComplianceService, DIFF_FIELDS, diffRules(), PublicComplianceRule, serializeDiffValue(), buildService() (+3 more)

### Community 67 - "1. IDEA CONTEXT (read this first)"
Cohesion: 0.50
Nodes (4): 1. IDEA CONTEXT (read this first), Non-negotiable project rules (apply to BOTH MVPs), The DPDP concepts you need, in plain language, What MVP 1 delivers when done

### Community 68 - "MVP1 Evaluation Against Spec Section 6"
Cohesion: 0.07
Nodes (28): Check 10: Conflicts are surfaced, not silently resolved (GO-03), Check 11: Purpose and lawful basis are never inferred (LB-02), Check 12: The registers actually answer s.11(1)(b) (RT-04), Check 13: A processor cannot go live without a contract (GO-02), Check 14: Credentials are encrypted and never leave the backend, Check 15: The access log records who looked at whom (SE-03, SE-05), Check 16: The audit log cannot be edited, Check 17: Sequence has no gaps (+20 more)

### Community 69 - "employee-auth.service.ts"
Cohesion: 0.15
Nodes (9): getDummyHash(), EmployeeLoginResult, EmployeeRefreshResult, LoginRequestMeta, PrincipalAuthService, Injectable, RefreshRotationOutcome, rotateRefreshToken() (+1 more)

### Community 70 - "UpdateRolePermissionsDto"
Cohesion: 0.12
Nodes (14): ApiProperty, ArrayUnique, IsArray, IsString, UpdateRolePermissionsDto, RolesController, ApiTags, Body (+6 more)

### Community 71 - "EmployeeAuthController"
Cohesion: 0.19
Nodes (10): EmployeeAuthController, ApiTags, Body, Controller, HttpCode, Post, Req, Res (+2 more)

### Community 72 - "read-only-http.client.ts"
Cohesion: 0.22
Nodes (9): defaultSleep(), ReadOnlyHttpClient, ReadOnlyHttpMethodError, ReadOnlyHttpRequestOptions, ReadOnlyHttpResponse, ReadOnlyHttpStatusError, ReadOnlyHttpTimeoutError, RETRY_BACKOFF_MS (+1 more)

### Community 73 - "AppModule"
Cohesion: 0.11
Nodes (13): PERMISSIONS, PermissionSeed, AppModule, Module, EmployeeSession, ensurePermission(), Fixture, createOrgWithSettingsManager() (+5 more)

### Community 75 - "CreateTransferDto"
Cohesion: 0.06
Nodes (31): CreateTransferDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional (+23 more)

### Community 76 - "api-client.ts"
Cohesion: 0.03
Nodes (95): AppShell(), loginAs(), jsonResponse(), loginAndRender(), MockRoutes, SOURCE_RECORDS_RESPONSE, RecipientsTab(), jsonResponse() (+87 more)

### Community 77 - "recipients.service.ts"
Cohesion: 0.10
Nodes (21): CreateRecipientDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional (+13 more)

### Community 78 - "prisma.service.ts"
Cohesion: 0.06
Nodes (25): COMPLIANCE_RULE_SEEDS, ComplianceRuleSeed, seedComplianceRules(), extendWithTenantScoping(), storage, TenantContext, TenantStore, PRINCIPAL_ACCOUNT_PUBLIC_SELECT (+17 more)

### Community 79 - "RetentionService"
Cohesion: 0.13
Nodes (12): RetentionController, ApiTags, Body, Controller, Get, Param, Patch, Post (+4 more)

### Community 80 - "access-report-render.ts"
Cohesion: 0.38
Nodes (9): ACCESS_REPORT_CSV_HEADER, renderAccessReportCsv(), renderAccessReportPdf(), renderPdf(), writePdfLetterhead(), writePdfLine(), writePdfSectionHeading(), renderPrincipalEvidencePdf() (+1 more)

### Community 81 - "DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS"
Cohesion: 0.17
Nodes (11): 1. IDEA CONTEXT (read this first), 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 2 GOAL (definition of done), DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS, Non-negotiable rules (carried from MVP 1, still binding), Notice · Consent · Children · Rights · Retention · Breach · Evidence, One new rule, specific to MVP 2 (+3 more)

### Community 82 - "dataset.test.ts"
Cohesion: 0.12
Nodes (18): seedDatabase(), selfCheck(), toSimRecords(), last6(), nameKey(), normalizeEmail(), normalizePhone(), SimCandidate (+10 more)

### Community 83 - "generateDataset"
Cohesion: 0.32
Nodes (11): formatDob(), generateDataset(), adultDob(), buildLinkedPair(), childDob(), fillSystemRecord(), nextEmail(), nextPhoneDigits() (+3 more)

### Community 84 - "retention.service.ts"
Cohesion: 0.16
Nodes (14): RETENTION_LEGAL_BASIS_TYPES, RETENTION_TRIGGER_TYPES, RETENTION_UNITS, ApiPropertyOptional, IsBoolean, IsIn, IsInt, IsString (+6 more)

### Community 85 - "CreateNoticeVersionDto"
Cohesion: 0.24
Nodes (11): CreateNoticeVersionDto, ItemisedFieldInputDto, ApiProperty, ApiPropertyOptional, IsArray, IsOptional, IsString, IsUrl (+3 more)

### Community 86 - "CreateComplianceRuleDto"
Cohesion: 0.17
Nodes (11): CreateComplianceRuleDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional (+3 more)

### Community 88 - "PrincipalAuthController"
Cohesion: 0.25
Nodes (8): PrincipalAuthController, ApiTags, Body, Controller, HttpCode, Post, Req, Res

### Community 89 - "ScopedTransactionClient"
Cohesion: 0.05
Nodes (51): TenantScopedPrismaClient, ScopedTransactionClient, AgeService, Injectable, AssemblyService, Injectable, IdentifierLockSignal, lockIdentifiersForOwnership() (+43 more)

### Community 90 - "CreateSdfAssessmentDto"
Cohesion: 0.13
Nodes (11): ComplianceDeadlineSnapshot, CreateSdfAssessmentDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsIn, IsOptional (+3 more)

### Community 91 - "sync.e2e-spec.ts"
Cohesion: 0.13
Nodes (15): SyncCounts, SyncRunSummary, SyncProcessor, Processor, FREQUENCY_CRON_PATTERNS, SYNC_QUEUE_NAME, SYNC_SCHEDULE_TRIGGERED_BY, SYNC_WORKER_CONCURRENCY (+7 more)

### Community 92 - "mappings.controller.ts"
Cohesion: 0.06
Nodes (38): AttachPurposesDto, ApiProperty, ArrayUnique, IsArray, IsString, MappingWarningPurposeSummaryResponseDto, MappingWarningResponseDto, ApiProperty (+30 more)

### Community 93 - "connector.factory.ts"
Cohesion: 0.19
Nodes (6): ConnectorFactory, DataSourceRowForConnector, Injectable, Connector, ConnectorsModule, Module

### Community 94 - "seed.ts"
Cohesion: 0.19
Nodes (13): DEMO_EMPLOYEES, main(), seedMessageTemplates(), SYSTEM_MESSAGE_TEMPLATES, SystemMessageTemplateSeed, ALL_PERMISSION_CODES, ROLES, RoleSeed (+5 more)

### Community 95 - "DPDP Platform MVP 2 — Compliance Operations — Implementation Plan"
Cohesion: 0.17
Nodes (11): Context, DPDP Platform MVP 2 — Compliance Operations — Implementation Plan, Finishing, Global Constraints, Interface publication, MVP 1 left the door open deliberately — use these, do not rebuild them, Pre-flight conflict scan (orchestrator, before Task 1), Rulings taken up front (+3 more)

### Community 96 - "2. ARCHITECTURE"
Cohesion: 0.33
Nodes (6): 2.1 New packages (everything from MVP 1 stays), 2.2 New Prisma models (all MVP 1 models unchanged), 2.3 Raw SQL follow-up migration, 2.4 Seeded compliance rules — defaults for a DPO to review, not legal advice, 2.5 Background jobs (added to the MVP 1 BullMQ setup), 2. ARCHITECTURE

### Community 97 - "compilerOptions"
Cohesion: 0.07
Nodes (29): compilerOptions, allowImportingTsExtensions, baseUrl, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+21 more)

### Community 98 - "assembly.service.ts"
Cohesion: 0.11
Nodes (22): ageStatusFor(), compareNewest(), DobCandidate, AssembledField, assembleFields(), AssemblyMapping, AssemblyRecord, compareNewest() (+14 more)

### Community 99 - "ImportConsentDto"
Cohesion: 0.20
Nodes (9): ImportConsentDto, ApiProperty, ApiPropertyOptional, IsIn, IsObject, IsOptional, IsString, IsUUID (+1 more)

### Community 100 - "SyncPipelineService"
Cohesion: 0.13
Nodes (13): describeSyncError(), MESSAGE_SAFE_ERROR_CLASSES, MissingRecordKeyError, IdentifierOwnershipConflictError, NotFoundException, PageCapExceededError, SomeFutureDomainError, SyncErrorDescription (+5 more)

### Community 101 - "sdf.module.ts"
Cohesion: 0.11
Nodes (15): SdfCycleScanService, Injectable, SdfModule, Module, SdfCycleScanProcessor, Processor, SDF_CYCLE_SCAN_CRON_PATTERN, SDF_CYCLE_SCAN_JOB_NAME (+7 more)

### Community 102 - "merge-unmerge.e2e-spec.ts"
Cohesion: 0.13
Nodes (17): CandidateNormalizedRecord, CandidateSignal, isoDate(), MatchCandidateListItem, recordValueFor(), SIGNAL_FIELDS, SignalAgreement, activeLink() (+9 more)

### Community 103 - "DeadlineScanProcessor"
Cohesion: 0.40
Nodes (3): DeadlineScanProcessor, Processor, DeadlineScanJobData

### Community 104 - "NotificationsService"
Cohesion: 0.11
Nodes (22): CurrentNotificationActor, MarkAllReadResponseDto, NotificationDto, NotificationListResponseDto, ApiProperty, ApiPropertyOptional, JwtAnyActorGuard, NotificationCallerActor (+14 more)

### Community 105 - "retention.module.ts"
Cohesion: 0.12
Nodes (15): buildCancellationReason(), buildPreErasureNoticeBody(), PreErasureNoticeService, Injectable, PreErasureNoticeProcessor, Processor, RetentionScanProcessor, Processor (+7 more)

### Community 107 - "access-report.service.ts"
Cohesion: 0.10
Nodes (19): AccessLogService, RecordPersonalDataViewedInput, Injectable, AccessReportConsentEntry, AccessReportConsentHistoryEntry, AccessReportData, AccessReportProcessingActivity, AccessReportRecipient (+11 more)

### Community 108 - "campaign-send.processor.ts"
Cohesion: 0.17
Nodes (10): CampaignSendProcessor, Processor, CAMPAIGN_SEND_MAX_ATTEMPTS, CAMPAIGN_SEND_QUEUE_NAME, CAMPAIGN_SEND_WORKER_CONCURRENCY, CampaignSendJobData, campaignSendJobId(), CampaignSendQueueService (+2 more)

### Community 109 - "RetentionScanService"
Cohesion: 0.28
Nodes (3): addByDeadlineUnit(), RetentionScanService, Injectable

### Community 110 - "DataSourceDetailPage.tsx"
Cohesion: 0.04
Nodes (70): DataTable(), clickAction, columns, Row, CheckboxOption, errorLogEntries(), STATUS_VARIANT, SyncHistoryTable() (+62 more)

### Community 111 - "queues.module.ts"
Cohesion: 0.18
Nodes (8): toRedisConnectionOptions(), lockKey(), SYNC_LOCK_HEARTBEAT_INTERVAL_MS, SYNC_LOCK_PREFIX, SYNC_LOCK_TTL_MS, SyncLockHandle, SyncLockService, Injectable

### Community 112 - "csvDocument"
Cohesion: 0.28
Nodes (4): EvidencePackService, Injectable, csvDocument(), sortedUnique()

### Community 113 - "seed-principals.ts"
Cohesion: 0.29
Nodes (10): DEMO_ORG, DEMO_PASSWORD, DemoEmployeeSeed, claimDemoPrincipalAccounts(), ClaimResult, DEMO_PRINCIPALS_TO_CLAIM, DemoPrincipalToClaim, main() (+2 more)

### Community 114 - ".setStatus"
Cohesion: 0.18
Nodes (9): MeConsentsController, ApiTags, Body, Controller, Get, Param, Post, Req (+1 more)

### Community 115 - "requests.controller.ts"
Cohesion: 0.13
Nodes (14): AssignRequestDto, ApiProperty, ApiPropertyOptional, IsOptional, IsString, MinLength, EscalateRequestDto, ApiPropertyOptional (+6 more)

### Community 116 - "template-renderer.ts"
Cohesion: 0.13
Nodes (22): assertSimpleWhitelistedMustache(), DisallowedTemplateSyntaxError, engine, extractTemplateVariables(), MissingOrganizationContactError, MissingRequiredVariableError, OrganizationContactFields, renderMessageTemplate() (+14 more)

### Community 117 - ".record"
Cohesion: 0.06
Nodes (32): assertNoForbiddenMetadata(), CreatePurposeDto, ApiProperty, ApiPropertyOptional, IsArray, IsEnum, IsOptional, IsString (+24 more)

### Community 118 - "retention.e2e-spec.ts"
Cohesion: 0.06
Nodes (28): findActiveNonDisclosureDirections(), isUnderActiveNonDisclosure(), CreateFromTriggerInput, PreErasureNoticeSummary, makeOrg(), EXPECTED_BASIS_BY_RULE_CODE, addEmployee(), attachPurposeAndMapping() (+20 more)

### Community 119 - "evaluate-mvp1.sh"
Cohesion: 0.39
Nodes (8): attach_purpose(), auth(), create_purpose(), create_source(), map_source(), NVM_DIR, evaluate-mvp1.sh script, sync_and_wait()

### Community 120 - "routes.test.ts"
Cohesion: 0.25
Nodes (7): closeDb(), { buildServer }, EXPECTED_FIELDS, KEYS, { openDb, closeDb }, ROUTES, TEST_DB_PATH

### Community 121 - ".unmerge"
Cohesion: 0.15
Nodes (10): ApiProperty, IsString, MinLength, UnmergeDto, ApiTags, Body, Controller, Param (+2 more)

### Community 122 - "Waves and Tasks"
Cohesion: 0.25
Nodes (8): Task 16 — Promoted UI primitives, compliance chips, countdowns and notification polling, Task 1 — Schema, migrations, triggers, tenancy registration, audit actions, packages, test harness, Task 25 — MVP 2 demo seed and the performance dataset, Task 26 — The full evaluation run, Wave 0 — Foundation (1 task, sequential; nothing else can start), Wave 5 — Frontend shared layer (1 task, sequential; every later page depends on it), Wave 8 — Demo data, scale and acceptance (2 tasks, sequential), Waves and Tasks

### Community 123 - "dependencies"
Cohesion: 0.06
Nodes (31): class-variance-authority, clsx, dependencies, class-variance-authority, clsx, date-fns, date-fns-tz, lucide-react (+23 more)

### Community 124 - "legal-hold.service.ts"
Cohesion: 0.16
Nodes (14): CreateLegalHoldDto, LegalHoldScopeDto, ApiProperty, ApiPropertyOptional, IsArray, IsDateString, IsOptional, IsString (+6 more)

### Community 126 - "Public"
Cohesion: 0.11
Nodes (20): ApiExtraModels, CurrentPrincipal, Public(), JwtPrincipalGuard, PrincipalActor, Injectable, Get, UseGuards (+12 more)

### Community 127 - "principal-portal.e2e-spec.ts"
Cohesion: 0.31
Nodes (8): PURPOSE_NOT_CONFIGURED, createFixture(), createPrincipal(), createSource(), EmployeeSession, ensurePermission(), Fixture, PrincipalSession

### Community 128 - "ComplianceController"
Cohesion: 0.20
Nodes (8): ComplianceController, ApiTags, Body, Controller, Get, Param, Patch, Post

### Community 129 - "PDFDocument"
Cohesion: 0.13
Nodes (4): PDFDocument, PDFDocumentOptions, pdfkit, PDFTextOptions

### Community 130 - "TokenService"
Cohesion: 0.12
Nodes (7): IS_PUBLIC_KEY, JwtEmployeeGuard, Injectable, TenantMiddleware, Injectable, TokenService, Injectable

### Community 131 - "NotificationBell.tsx"
Cohesion: 0.23
Nodes (11): NotificationBell(), NotificationBellProps, NotificationRow(), EMPTY, ApiClient, listNotifications(), markAllNotificationsRead(), MarkAllReadResponse (+3 more)

### Community 132 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include (+1 more)

### Community 134 - "SyncQueueService"
Cohesion: 0.22
Nodes (6): ScheduleReconciliationService, Injectable, SyncQueueService, syncSchedulerId(), Injectable, InjectQueue

### Community 135 - "Wave 1 — Engines (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I1, Task 2 — ComplianceService, rule versioning and the compliance-rules API, Task 3 — Template storage, whitelisted Handlebars rendering, and the fifteen system templates, Task 4 — The audience compiler and preview endpoint, Task 5 — Mail transport, notification providers and the notifications API, Wave 1 — Engines (4 parallel + integrator)

### Community 136 - "InventoryService"
Cohesion: 0.19
Nodes (7): InventoryController, ApiTags, Controller, Get, Res, InventoryService, Injectable

### Community 137 - "sync.service.ts"
Cohesion: 0.09
Nodes (21): DEFAULT_SYNC_JOB_LIST_LIMIT, ListSyncJobsQueryDto, MAX_SYNC_JOB_LIST_LIMIT, IsInt, IsOptional, IsString, Max, Min (+13 more)

### Community 141 - "Wave 2 — Domain services, part one (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I2, Task 6 — The rights request engine and `deadline-scan`, Task 7 — The notice builder, Task 8 — Children, guardians and exemption claims, Task 9 — Retention core, the floor, legal holds and the retention jobs, Wave 2 — Domain services, part one (4 parallel + integrator)

### Community 142 - "UpdateAlgorithmEntryDto"
Cohesion: 0.20
Nodes (10): ApiPropertyOptional, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString (+2 more)

### Community 143 - "Wave 3 — Domain services, part two (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I3, Task 10 — Consent records, events, backfill and one-click withdrawal, Task 11 — Campaigns, the eight send guards, and delivery, Task 12 — Access report, per-principal evidence, chain verification and the evidence pack, Task 13 — SDF pack, Board and Government interaction, Wave 3 — Domain services, part two (4 parallel + integrator)

### Community 144 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, preview, test, test:watch, typecheck

### Community 145 - "SdfController"
Cohesion: 0.10
Nodes (12): AlgorithmRegisterService, Injectable, SdfController, ApiTags, Body, Controller, Get, Param (+4 more)

### Community 146 - "DataSourcesService"
Cohesion: 0.24
Nodes (4): DataSourcesService, duplicateNameMessage(), isUniqueConstraintViolation(), Injectable

### Community 147 - "frontend/package.json"
Cohesion: 0.29
Nodes (6): description, license, name, private, type, version

### Community 149 - "AccessTokenPayload"
Cohesion: 0.08
Nodes (28): CurrentActor, AppConfig, EmployeeLoginDto, ApiProperty, IsEmail, IsString, MinLength, EmployeeMeResponseDto (+20 more)

### Community 150 - "Wave 6 — Frontend, part one (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I5, Task 17 — `/app/requests`, `/app/requests/:ref`, `/app/settings/rights`, Task 18 — `/app/notices`, `/app/consents`, `/app/settings/compliance`, Task 19 — `/app/children`, `/app/retention`, Task 20 — The Data Principal portal, Wave 6 — Frontend, part one (4 parallel + integrator)

### Community 151 - "Wave 7 — Frontend, part two (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I6, Task 21 — `/app/messaging/templates`, `/app/messaging/campaigns`, the audience builder UI, Task 22 — `/app/breaches` and the creation wizard, Task 23 — `/app/sdf` and `/app/information-requests`, Task 24 — `/app/principals/:id/evidence`, audit UI and dashboard tiles, Wave 7 — Frontend, part two (4 parallel + integrator)

### Community 154 - "notifications.module.ts"
Cohesion: 0.10
Nodes (24): MailModule, Module, MailerService, MailMessage, Injectable, MailConfig, EMAIL_PROVIDER, selectEmailProvider() (+16 more)

### Community 155 - "PrincipalLoginDto"
Cohesion: 0.33
Nodes (5): PrincipalLoginDto, ApiProperty, IsEmail, IsString, MinLength

### Community 157 - "UpdateComplianceRuleDto"
Cohesion: 0.18
Nodes (10): ApiPropertyOptional, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min (+2 more)

### Community 162 - "LineageService"
Cohesion: 0.24
Nodes (4): LineageService, Injectable, PrincipalRecipientsService, Injectable

### Community 163 - "templates.service.ts"
Cohesion: 0.09
Nodes (25): CreateTemplateDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsEnum, IsOptional, IsString (+17 more)

### Community 164 - "CreateSharingActivityDto"
Cohesion: 0.18
Nodes (11): CreateSharingActivityDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum (+3 more)

### Community 165 - "data-sources.e2e-spec.ts"
Cohesion: 0.11
Nodes (13): jsonHandler(), MockHttpServer, createManager(), createOrgWithRole(), ensurePermission(), startRecordsServer(), createEmployee(), createOrg() (+5 more)

### Community 166 - "registers.e2e-spec.ts"
Cohesion: 0.39
Nodes (8): authed(), createDataSource(), createEmployeeWithPermissions(), createOrgWithManager(), createPurpose(), createRecipient(), ensurePermission(), recipientPayload()

### Community 167 - "Wave 4 — Breach and the remaining jobs (2 parallel + integrator)"
Cohesion: 0.50
Nodes (4): Integrator I4, Task 14 — The breach module, Task 15 — The remaining scheduled jobs and the scheduler consolidation, Wave 4 — Breach and the remaining jobs (2 parallel + integrator)

### Community 168 - "CreateAlgorithmEntryDto"
Cohesion: 0.18
Nodes (11): CreateAlgorithmEntryDto, ApiProperty, ApiPropertyOptional, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn (+3 more)

### Community 175 - "zip-writer.ts"
Cohesion: 0.47
Nodes (5): buildZip(), crc32(), CRC_TABLE, toDosDateTime(), ZipEntryInput

### Community 177 - "PrincipalEvidenceService"
Cohesion: 0.23
Nodes (8): PrincipalEvidenceController, ApiTags, Controller, Get, Param, Res, PrincipalEvidenceService, Injectable

### Community 178 - "canonicalJson"
Cohesion: 0.13
Nodes (14): canonicalJson(), Custom, stringify(), typeLabel(), AuditChainService, ChainVerificationResult, Injectable, AuditEventsEvidenceController (+6 more)

### Community 179 - "EnvironmentVariables"
Cohesion: 0.21
Nodes (10): ACCESS_LOG_RETENTION_FLOOR_DAYS, EnvironmentVariables, IsIn, IsInt, IsNotEmpty, IsString, Min, MinLength (+2 more)

### Community 180 - "app.module.ts"
Cohesion: 0.06
Nodes (54): AuditModule, Module, MaskingModule, Module, ReferenceModule, Module, AuditReadModule, Module (+46 more)

### Community 183 - "ListRequestsDto"
Cohesion: 0.15
Nodes (8): ListRequestsDto, IsBoolean, IsEnum, IsOptional, IsString, Transform, Get, Query

### Community 184 - "audit-read.service.ts"
Cohesion: 0.10
Nodes (20): AUDIT_ACTIONS, NOTE: the spec's §4.7 prose claims "33 MVP 1 action names", but the, ACCESS_LOG_CSV_HEADER, AUDIT_EVENT_LIST_SELECT, AuditEventListItem, AuditEventListResult, AuditEventListRow, AuditReadService (+12 more)

### Community 185 - "masking.service.ts"
Cohesion: 0.27
Nodes (7): CAN_VIEW_ALL_PERSONAL_DATA, PASS_THROUGH_FIELDS, InventoryGap, InventorySummary, NON_PERSONAL_DATA_CANONICAL_FIELDS, RecentAuditEvent, ShortfallCounts

### Community 187 - "PrismaService"
Cohesion: 0.05
Nodes (18): AuditService, Injectable, PrismaService, Injectable, EMPLOYEE_PUBLIC_SELECT, PublicEmployee, NOTE: the fixed AuditAction union (Task 4, spec lines 880-891) has, AUDIT_LOG_CSV_HEADER (+10 more)

### Community 188 - "csv-writer.ts"
Cohesion: 0.33
Nodes (6): withCsvLetterhead(), csvField(), csvRow(), needsQuoting(), RFC-4180, RFC-4180

### Community 191 - "SetMyConsentDto"
Cohesion: 0.20
Nodes (9): SetMyConsentDto, ApiProperty, ApiPropertyOptional, IsIn, IsObject, IsOptional, IsString, IsUUID (+1 more)

### Community 192 - "CreateRetentionPolicyDto"
Cohesion: 0.20
Nodes (10): CreateRetentionPolicyDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn, IsInt, IsOptional, IsString (+2 more)

### Community 201 - "TemplatesService"
Cohesion: 0.14
Nodes (11): TemplatesController, ApiTags, Body, Controller, Get, Param, Patch, Post (+3 more)

### Community 202 - "compile-audience.ts"
Cohesion: 0.09
Nodes (43): AudienceFilterError, AUDIENCE_FILTER_FIELDS, AUDIENCE_FILTER_OPERATORS, AudienceFilter, AudienceFilterField, AudienceFilterGroup, AudienceFilterNode, AudienceFilterOperator (+35 more)

### Community 203 - "CandidatesService"
Cohesion: 0.22
Nodes (7): CandidatesController, ApiTags, Controller, Param, Post, CandidatesService, Injectable

### Community 204 - "ListPrincipalsDto"
Cohesion: 0.25
Nodes (8): ListPrincipalsDto, IsEnum, IsInt, IsOptional, IsString, Max, Min, Transform

### Community 205 - "RequirePermission"
Cohesion: 0.06
Nodes (32): CurrentActorPermissions, PERMISSION_KEY, RequirePermission(), PermissionsRequest, AuditReadController, ApiTags, Controller, Get (+24 more)

### Community 206 - "AddNoteDto"
Cohesion: 0.25
Nodes (7): AddNoteDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsOptional, IsString, MinLength

### Community 207 - "ChangeStatusDto"
Cohesion: 0.25
Nodes (8): ChangeStatusDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsEnum, IsIn, IsOptional, IsString

### Community 208 - "ConsentBackfillService"
Cohesion: 0.21
Nodes (7): ConsentBackfillService, Injectable, ConsentBackfillProcessor, Processor, CONSENT_BACKFILL_QUEUE_NAME, CONSENT_BACKFILL_SCHEDULE_TRIGGERED_BY, ConsentBackfillJobData

### Community 209 - "VerifyIdentityDto"
Cohesion: 0.29
Nodes (6): ApiProperty, ApiPropertyOptional, IsOptional, IsString, MinLength, VerifyIdentityDto

### Community 211 - "PrismaModule"
Cohesion: 0.67
Nodes (3): PrismaModule, Module, Global

### Community 213 - "RequestsController"
Cohesion: 0.29
Nodes (6): RequestsController, ApiTags, Body, Controller, Param, Post

### Community 214 - "EvidencePackController"
Cohesion: 0.29
Nodes (5): EvidencePackController, ApiTags, Controller, Get, Res

### Community 221 - "guardians.service.ts"
Cohesion: 0.06
Nodes (36): APPOINTING_AUTHORITIES, AppointingAuthority, CreateGuardianDto, ApiProperty, ApiPropertyOptional, IsEmail, IsEnum, IsIn (+28 more)

## Knowledge Gaps
- **973 isolated node(s):** `NotFoundException`, `PageCapExceededError`, `SomeFutureDomainError`, `SyncErrorDescription`, `CandidateNormalizedRecord` (+968 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequirePermission()` connect `RequirePermission` to `ComplianceController`, `InventoryService`, `sync.service.ts`, `UpdateOrganizationDto`, `security-measures.service.ts`, `SdfController`, `AccessTokenPayload`, `CreateVoluntaryUndertakingDto`, `data-sources.service.ts`, `employees.controller.ts`, `CreateInformationRequestDto`, `templates.service.ts`, `RecipientsService`, `registers.module.ts`, `SharingService`, `ConsentsService`, `DataSourcesController`, `canonicalJson`, `age-status.service.ts`, `PrincipalEvidenceService`, `notices.service.ts`, `retention/retention.controller.ts`, `ListRequestsDto`, `child-exemptions.service.ts`, `sdf-assessment.service.ts`, `UpdateRolePermissionsDto`, `TemplatesService`, `CandidatesService`, `CreateTransferDto`, `recipients.service.ts`, `RetentionService`, `access-report-render.ts`, `retention.service.ts`, `RequestsController`, `EvidencePackController`, `CreateSdfAssessmentDto`, `mappings.controller.ts`, `guardians.service.ts`, `ImportConsentDto`, `requests.controller.ts`, `.record`, `.unmerge`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `PrismaService` to `TokenService`, `SyncQueueService`, `InventoryService`, `sync.service.ts`, `security-measures.service.ts`, `SdfController`, `AccessTokenPayload`, `requests.service.ts`, `erasure-task.service.ts`, `CreateVoluntaryUndertakingDto`, `campaigns.service.ts`, `notifications.module.ts`, `data-sources.service.ts`, `principals.e2e-spec.ts`, `LineageService`, `templates.service.ts`, `mappings.service.ts`, `data-sources.e2e-spec.ts`, `principals.service.ts`, `registers.module.ts`, `registers.e2e-spec.ts`, `canonicalJson`, `age-status.service.ts`, `notices.service.ts`, `BootRegistrationRegistry`, `principal-auth.e2e-spec.ts`, `audit-read.service.ts`, `child-exemptions.service.ts`, `masking.service.ts`, `audit.service.ts`, `sdf-assessment.service.ts`, `compliance.service.ts`, `employee-auth.service.ts`, `EmployeeAuthController`, `AppModule`, `PermissionsGuard`, `compile-audience.ts`, `CreateTransferDto`, `RequirePermission`, `prisma.service.ts`, `recipients.service.ts`, `ConsentBackfillService`, `retention.service.ts`, `ScopedTransactionClient`, `sync.e2e-spec.ts`, `guardians.service.ts`, `seed.ts`, `assembly.service.ts`, `sdf.module.ts`, `merge-unmerge.e2e-spec.ts`, `DeadlineScanProcessor`, `NotificationsService`, `access-report.service.ts`, `campaign-send.processor.ts`, `seed-principals.ts`, `retention.e2e-spec.ts`, `legal-hold.service.ts`, `Public`, `principal-portal.e2e-spec.ts`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `AuditService` connect `PrismaService` to `security-measures.service.ts`, `requests.service.ts`, `erasure-task.service.ts`, `campaigns.service.ts`, `data-sources.service.ts`, `templates.service.ts`, `mappings.service.ts`, `registers.module.ts`, `age-status.service.ts`, `app.module.ts`, `notices.service.ts`, `audit-read.service.ts`, `child-exemptions.service.ts`, `audit.service.ts`, `sdf-assessment.service.ts`, `compliance.service.ts`, `employee-auth.service.ts`, `CreateTransferDto`, `recipients.service.ts`, `prisma.service.ts`, `retention.service.ts`, `ScopedTransactionClient`, `guardians.service.ts`, `assembly.service.ts`, `merge-unmerge.e2e-spec.ts`, `access-report.service.ts`, `.record`, `retention.e2e-spec.ts`, `legal-hold.service.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `NotFoundException`, `PageCapExceededError`, `SomeFutureDomainError` to the rest of the system?**
  _973 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Consent & Breach Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `DPDP Compliance Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._