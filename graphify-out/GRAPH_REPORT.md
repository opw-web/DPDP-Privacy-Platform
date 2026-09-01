# Graph Report - DPDP app  (2026-09-01)

## Corpus Check
- 656 files · ~579,758 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5033 nodes · 11455 edges · 235 communities (202 shown, 33 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 390 edges (avg confidence: 0.8)
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
- api-client.ts
- UpdateOrganizationDto
- scripts
- nest-cli.json
- jest.config.ts
- tenant.extension.ts
- security-measures.service.ts
- CryptoService
- dependencies
- button.tsx
- requests.service.ts
- breach.service.ts
- .record
- erasure-task.service.ts
- CreateVoluntaryUndertakingDto
- campaigns.service.ts
- employeeApiClient
- data-sources.service.ts
- employees.service.ts
- CreateInformationRequestDto
- principals.e2e-spec.ts
- RequestsService
- CampaignsService
- demo-company-server/package.json
- MeConsentsPage.tsx
- mappings.service.ts
- me-rights.service.ts
- principals.service.ts
- MeRightsService
- normalization.service.ts
- EmployeesPage.tsx
- server.ts
- AuditPage
- CreateSharingActivityDto
- cn
- ConsentsService
- compilerOptions
- exclude
- DataSourcesService
- BootRegistrationRegistry
- age-status.service.ts
- notices.service.ts
- HealthService
- AccessTokenPayload
- generate.ts
- backend/package.json
- child-exemptions.service.ts
- rest-api.connector.ts
- demo-company-server
- prisma.service.ts
- sdf-assessment.service.ts
- 4. REQUIREMENTS
- devDependencies
- DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING
- MessagingCampaignBuilderPage.tsx
- compliance.service.ts
- 1. IDEA CONTEXT (read this first)
- MVP1 Evaluation Against Spec Section 6
- principal-auth.service.ts
- roles.service.ts
- EmployeeAuthController
- read-only-http.client.ts
- seed.ts
- PermissionsGuard
- CreateTransferDto
- router.tsx
- recipients.service.ts
- BreachesController
- retention.service.ts
- access-report-render.ts
- DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS
- dataset.test.ts
- generateDataset
- purposes.service.ts
- retention.e2e-spec.ts
- CreateComplianceRuleDto
- Rng
- PrincipalAuthController
- ScopedTransactionClient
- seed-scale.ts
- sync-pipeline.service.ts
- mappings.controller.ts
- connector.factory.ts
- VerifyGuardianDto
- DPDP Platform MVP 2 — Compliance Operations — Implementation Plan
- 2. ARCHITECTURE
- compilerOptions
- assembly.service.ts
- NotificationsService
- BreachWizardPage.tsx
- sdf.module.ts
- merge-unmerge.e2e-spec.ts
- deadline-scan.processor.ts
- notifications.controller.ts
- retention.module.ts
- MeDataPage.tsx
- access-report.service.ts
- breach-principal-notice-dispatch.processor.ts
- RetentionScanService
- data-sources-api.ts
- queues.module.ts
- csvDocument
- children/types.ts
- SetMyConsentDto
- requests.controller.ts
- template-renderer.ts
- UpdatePurposeDto
- PrismaService
- evaluate-mvp1.sh
- routes.test.ts
- .unmerge
- Waves and Tasks
- dependencies
- CreateLegalHoldDto
- auth.module.ts
- Public
- AppModule
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
- ReplaceMappingsDto
- audit-read.service.ts
- frontend/package.json
- MaskingService
- EmployeeMeResponseDto
- Wave 6 — Frontend, part one (4 parallel + integrator)
- Wave 7 — Frontend, part two (4 parallel + integrator)
- handlebars
- eslint-plugin-react-hooks
- notifications.module.ts
- MappingsController
- vite-env.d.ts
- UpdateComplianceRuleDto
- typescript-eslint
- @radix-ui/react-dialog
- vitest
- LineageService
- templates.service.ts
- CompleteErasureTaskDto
- mappings.e2e-spec.ts
- registers.e2e-spec.ts
- Wave 4 — Breach and the remaining jobs (2 parallel + integrator)
- CreateAlgorithmEntryDto
- zod
- zip-writer.ts
- ts-node
- PrincipalEvidenceService
- canonicalJson
- access-log-retention.processor.ts
- app.module.ts
- data-sources.module.ts
- prettier
- ListRequestsDto
- ListAuditEventsDto
- masking.service.ts
- tsconfig-paths
- AuditReadService
- evidence-pack.service.ts
- @types/node
- @types/nodemailer
- CreateCampaignDto
- source-purposes.service.ts
- MVP2 Evaluation Against Spec Sections 6 and 7
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
- AuditReadController
- ChangeStatusDto
- consents.module.ts
- VerifyIdentityDto
- CreateTemplateDto
- PrismaModule
- notifications.service.ts
- RequestsController
- EvidencePackController
- MailerService
- tenant-context.js
- SourcePurposesService
- SdfCycleScanService
- notifications.e2e-spec.ts
- MeRecipientsPage
- guardians.service.ts
- PermissionsController
- AuditChainVerifyProcessor
- .constructor
- PortalProvider
- AddMeRequestCommentDto
- FlagFrivolousDto
- LanguageSelector.tsx
- useCountdown.ts
- Grievance statutory-baseline fix report
- bullmq
- ioredis

## God Nodes (most connected - your core abstractions)
1. `RequirePermission()` - 181 edges
2. `PrismaService` - 131 edges
3. `AuditService` - 107 edges
4. `AccessTokenPayload` - 74 edges
5. `Button` - 66 edges
6. `cn()` - 64 edges
7. `employeeApiClient` - 59 edges
8. `ScopedTransactionClient` - 58 edges
9. `Card` - 53 edges
10. `CardContent` - 52 edges

## Surprising Connections (you probably didn't know these)
- `RecordContext` --references--> `NormalizationMapping`  [EXTRACTED]
  dpdp-platform/backend/src/modules/sync/sync-pipeline.service.ts → dpdp-platform/backend/src/modules/normalization/normalization.service.ts
- `createEmployeeWithPermissions()` --calls--> `ensurePermission()`  [EXTRACTED]
  dpdp-platform/backend/test/retention.e2e-spec.ts → dpdp-platform/backend/test/support/e2e-harness.ts
- `NotificationRow()` --calls--> `cn()`  [EXTRACTED]
  dpdp-platform/frontend/src/components/shared/NotificationBell.tsx → dpdp-platform/frontend/src/lib/utils.ts
- `DialogOverlay` --calls--> `cn()`  [EXTRACTED]
  dpdp-platform/frontend/src/components/ui/dialog.tsx → dpdp-platform/frontend/src/lib/utils.ts
- `seedDatabase()` --calls--> `openDb()`  [EXTRACTED]
  demo-company-server/src/seed/generate.ts → demo-company-server/src/db.ts

## Import Cycles
- None detected.

## Communities (235 total, 33 thin omitted)

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
Cohesion: 0.07
Nodes (38): ConflictBadge(), ConflictBadgeProps, ConflictingValue, LineageChip(), SourceRef, RuleGroupCard(), TransfersTab(), DATA_CATEGORY_VALUES (+30 more)

### Community 7 - "Tasks"
Cohesion: 0.05
Nodes (36): DPDP Platform MVP 1 — Implementation Plan, File Structure, Global Constraints, Risks and rulings taken up front, Task 10: Demo dataset generator — 500 records, 327 people, and the traps, Task 11: RestApiConnector with a GET-only HTTP client, Task 12: Data-source CRUD and credential encryption, Task 13: Field mapping, purpose attachment and the data-minimisation warning (+28 more)

### Community 8 - "compilerOptions"
Cohesion: 0.06
Nodes (31): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+23 more)

### Community 9 - "api-client.ts"
Cohesion: 0.06
Nodes (32): PurposeForm(), CorrectionWorkflow(), ErasureChecklist(), message(), RequestWorkPanel(), RequestRulePanel(), PrincipalField, PrincipalSource (+24 more)

### Community 10 - "UpdateOrganizationDto"
Cohesion: 0.08
Nodes (21): ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsObject (+13 more)

### Community 11 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, format, lint, seed, seed:principals, seed:scale, start (+7 more)

### Community 12 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 15 - "tenant.extension.ts"
Cohesion: 0.05
Nodes (41): client_1, common_1, PrismaService, tenant_extension_1, client_1, ALL_SCOPED_MODEL_NAMES, buildModelOverrides(), lowerFirst() (+33 more)

### Community 17 - "security-measures.service.ts"
Cohesion: 0.06
Nodes (33): CreateSecurityMeasureDto, SECURITY_MEASURE_TYPES, SECURITY_RULE_REFERENCES, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsIn (+25 more)

### Community 18 - "CryptoService"
Cohesion: 0.20
Nodes (8): CryptoModule, Module, CryptoService, InvalidEncryptionKeyError, MalformedCiphertextError, makeService(), VALID_KEY_B64, Injectable

### Community 19 - "dependencies"
Cohesion: 0.05
Nodes (39): argon2, class-transformer, class-validator, dependencies, argon2, class-transformer, class-validator, date-fns (+31 more)

### Community 20 - "button.tsx"
Cohesion: 0.04
Nodes (85): EmptyState(), EmptyStateAction, EmptyStateProps, Skeleton(), Badge(), badgeVariants, Button, ButtonProps (+77 more)

### Community 21 - "requests.service.ts"
Cohesion: 0.20
Nodes (14): APPLIES_TO_BY_REQUEST_TYPE, DEADLINE_SCAN_ACTOR_LABEL, DEADLINE_WARNING_EVENT_NOTE, ERASURE_STATUTORY_GROUND_TEXT, ERASURE_STATUTORY_GROUNDS, ErasureStatutoryGround, REJECTION_REASON_MIN_LENGTH, TERMINAL_REQUEST_STATUSES (+6 more)

### Community 22 - "breach.service.ts"
Cohesion: 0.05
Nodes (42): BoardBreachReport, BREACH_PUBLIC_SELECT, BREACH_RULES, parseIds(), TRANSITIONS, AffectedPreview, PublicBreachAffectedPrincipal, PublicBreachObligation (+34 more)

### Community 23 - ".record"
Cohesion: 0.12
Nodes (11): asDate(), BreachService, Injectable, PublicBreach, MergeService, Injectable, BreachClockProcessor, Processor (+3 more)

### Community 24 - "erasure-task.service.ts"
Cohesion: 0.09
Nodes (19): addByDeadlineUnit(), ProcessorChecklistEntry, SystemChecklistEntry, ACCOUNT_ACCESS_CANONICAL_FIELDS, ERASURE_TASK_PUBLIC_SELECT, ErasureChecklistSubmission, ErasureTaskService, ErasureTrigger (+11 more)

### Community 25 - "CreateVoluntaryUndertakingDto"
Cohesion: 0.05
Nodes (40): CreateVoluntaryUndertakingDto, ApiProperty, ApiPropertyOptional, IsArray, IsDateString, IsOptional, IsString, MinLength (+32 more)

### Community 26 - "campaigns.service.ts"
Cohesion: 0.18
Nodes (11): ActiveNonDisclosureDirection, CAMPAIGN_PUBLIC_SELECT, CAMPAIGN_RECIPIENT_PUBLIC_SELECT, CHILD_LIKE_AGE_STATUSES, COMPLIANCE_CATEGORIES, PublicCampaign, PublicCampaignRecipient, ResolvedRecipient (+3 more)

### Community 27 - "employeeApiClient"
Cohesion: 0.03
Nodes (138): PermissionGate(), PermissionGateProps, Checkbox, CheckboxOption, CheckboxOptionProps, Input, InputProps, Label (+130 more)

### Community 28 - "data-sources.service.ts"
Cohesion: 0.08
Nodes (25): CONNECTOR_SOURCE_SELECT, DATA_SOURCE_FIELD_SELECT, DATA_SOURCE_PUBLIC_SELECT, PublicDataSource, PublicDataSourceField, TestConnectionResult, CreateDataSourceDto, ApiProperty (+17 more)

### Community 29 - "employees.service.ts"
Cohesion: 0.07
Nodes (27): CreateEmployeeDto, ApiProperty, IsEmail, IsString, MinLength, ResetEmployeePasswordDto, ApiProperty, IsString (+19 more)

### Community 30 - "CreateInformationRequestDto"
Cohesion: 0.06
Nodes (33): CreateInformationRequestDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn (+25 more)

### Community 31 - "principals.e2e-spec.ts"
Cohesion: 0.31
Nodes (6): createFixture(), createPrincipal(), createSource(), EmployeeSession, ensurePermission(), Fixture

### Community 32 - "RequestsService"
Cohesion: 0.31
Nodes (3): RequestsService, transitionTargets(), Injectable

### Community 33 - "CampaignsService"
Cohesion: 0.13
Nodes (11): recordNonDisclosureSuppression(), CampaignsController, ApiTags, Controller, Get, Param, Post, CampaignsService (+3 more)

### Community 34 - "demo-company-server/package.json"
Cohesion: 0.07
Nodes (26): better-sqlite3, dependencies, better-sqlite3, fastify, description, devDependencies, ts-node, @types/better-sqlite3 (+18 more)

### Community 35 - "MeConsentsPage.tsx"
Cohesion: 0.10
Nodes (21): ConfirmDialogProps, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter(), DialogHeader(), DialogOverlay (+13 more)

### Community 36 - "mappings.service.ts"
Cohesion: 0.18
Nodes (11): computeMappingWarnings(), MappingForWarningCheck, MappingWarning, MappingWarningPurposeSummary, duplicateSourceFieldMessage(), isUniqueConstraintViolation(), MappingsService, PublicSourceFieldMapping (+3 more)

### Community 37 - "me-rights.service.ts"
Cohesion: 0.07
Nodes (26): CreateMeRequestDto, PRINCIPAL_REQUEST_TYPES, PrincipalRequestType, ApiProperty, ApiPropertyOptional, IsIn, IsObject, IsOptional (+18 more)

### Community 38 - "principals.service.ts"
Cohesion: 0.10
Nodes (19): DATA_CATEGORY_ORDER, MeDataCategoryGroup, MeDataValue, PURPOSE_NOT_CONFIGURED, MAX_PRINCIPALS_PAGE, PRINCIPALS_PAGE_SIZE, pickDisplayName(), resolveProvenance() (+11 more)

### Community 39 - "MeRightsService"
Cohesion: 0.11
Nodes (10): MeRightsController, Body, Controller, Param, Post, Put, Query, UseGuards (+2 more)

### Community 40 - "normalization.service.ts"
Cohesion: 0.14
Nodes (15): asPayload(), copyJson(), NormalizationSourceRecord, NormalizedRecordInput, nullableString(), RawPayload, rawString(), stableMappings() (+7 more)

### Community 41 - "EmployeesPage.tsx"
Cohesion: 0.05
Nodes (52): ExportButtons(), handleExport(), saveBlob(), GapsPanel(), GapsPanelProps, LinkedRecordsPanel(), LinkedRecordsPanelProps, SourceRecordItem (+44 more)

### Community 42 - "server.ts"
Cohesion: 0.30
Nodes (15): requireBearer(), System, SYSTEM_KEYS, openDb(), onlyGet(), envelope(), PageParams, parsePageParams() (+7 more)

### Community 43 - "AuditPage"
Cohesion: 0.28
Nodes (6): AuditPage(), downloadEvidencePack(), exportAccessLog(), exportAudit(), buildQueryString(), saveBlob()

### Community 44 - "CreateSharingActivityDto"
Cohesion: 0.06
Nodes (34): CreateSharingActivityDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum (+26 more)

### Community 45 - "cn"
Cohesion: 0.04
Nodes (64): DataTableProps, EmptyStateConfig, DateTime(), DateTimeProps, OrgTimezoneContext, OrgTimezoneProvider, useOrgTimezone(), BADGE_VARIANT (+56 more)

### Community 46 - "ConsentsService"
Cohesion: 0.08
Nodes (20): ConsentsController, ApiTags, Body, Controller, Get, Param, Post, Req (+12 more)

### Community 47 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+9 more)

### Community 48 - "exclude"
Cohesion: 0.17
Nodes (11): compilerOptions, noEmit, outDir, rootDir, exclude, extends, ../dist, ../node_modules (+3 more)

### Community 49 - "DataSourcesService"
Cohesion: 0.10
Nodes (14): Delete, DataSourcesController, ApiTags, Body, Controller, Get, HttpCode, Param (+6 more)

### Community 50 - "BootRegistrationRegistry"
Cohesion: 0.12
Nodes (14): BootRegistration, BootRegistrationRegistry, Injectable, RECONCILE_BOOT_TIMEOUT_MS, withBootTimeout(), InjectQueue, InjectQueue, Mvp2ScheduleReconciliationService (+6 more)

### Community 51 - "age-status.service.ts"
Cohesion: 0.13
Nodes (13): AgeStatusController, ApiTags, Body, Controller, Get, Param, Post, AGE_STATUS_PUBLIC_SELECT (+5 more)

### Community 52 - "notices.service.ts"
Cohesion: 0.05
Nodes (42): CreateNoticeDto, ApiProperty, ArrayMinSize, ArrayUnique, IsArray, IsString, MinLength, CreateNoticeVersionDto (+34 more)

### Community 53 - "HealthService"
Cohesion: 0.14
Nodes (12): ApiServiceUnavailableResponse, HealthController, ApiOkResponse, ApiTags, Controller, Get, HttpCode, HealthModule (+4 more)

### Community 54 - "AccessTokenPayload"
Cohesion: 0.07
Nodes (30): CurrentActor, ApiOkResponse, Get, ACCESS_TOKEN_AUDIENCES, AccessTokenAudience, AccessTokenPayload, REFRESH_TOKEN_AUDIENCES, RefreshTokenAudience (+22 more)

### Community 55 - "generate.ts"
Cohesion: 0.09
Nodes (23): ACCOUNT_STATUSES, Built, CAMPAIGN_SOURCES, CITY_POOL, EMAIL_FIELD, FIRST_NAMES, LAST_NAMES, PHONE_FIELD (+15 more)

### Community 56 - "backend/package.json"
Cohesion: 0.25
Nodes (7): description, license, name, prisma, seed, private, version

### Community 57 - "child-exemptions.service.ts"
Cohesion: 0.08
Nodes (25): ChildExemptionsController, ApiTags, Body, Controller, Get, Post, Query, ChildExemptionsService (+17 more)

### Community 58 - "rest-api.connector.ts"
Cohesion: 0.13
Nodes (12): DecodedCursor, extractRecords(), inferType(), InvalidCursorError, isIsoDateString(), PageCapExceededError, RestApiConnector, RestApiConnectorConfig (+4 more)

### Community 59 - "demo-company-server"
Cohesion: 0.18
Nodes (10): Access log, demo-company-server, Demo dataset (`npm run seed`), Endpoints — copy-paste table, Field names (deliberately messy — do not "fix" them), Personas, Running, Schema (+2 more)

### Community 60 - "prisma.service.ts"
Cohesion: 0.05
Nodes (44): RecordPersonalDataViewedInput, AuditAction, assertNoForbiddenMetadata(), AuditRecordInput, AuditService, FORBIDDEN_METADATA_KEY_FRAGMENTS, Injectable, allocateCounterValue() (+36 more)

### Community 61 - "sdf-assessment.service.ts"
Cohesion: 0.07
Nodes (24): CompleteSdfAssessmentDto, ApiPropertyOptional, IsBoolean, IsDateString, IsOptional, IsString, KIND_VALUES, PublicSdfAssessment (+16 more)

### Community 62 - "4. REQUIREMENTS"
Cohesion: 0.22
Nodes (9): 4.1 Tenancy, auth and permissions (SE-02, GO-04), 4.2 Connector layer, 4.3 Purposes and lawful basis (LB-01, LB-02, CN-02), 4.4 Normalization and identity resolution (GO-03), 4.5 API surface (MVP 1), 4.6 Frontend pages (MVP 1), 4.7 Audit requirements, 4.8 The demo company server (+1 more)

### Community 63 - "devDependencies"
Cohesion: 0.06
Nodes (33): autoprefixer, devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-refresh, globals, jsdom (+25 more)

### Community 64 - "DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING"
Cohesion: 0.29
Nodes (6): 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 1 GOAL (definition of done), DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING, Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every feature here exists to satisfy a checklist ID., Self-contained build document. Paste this entire file as your vibe-coding prompt.

### Community 65 - "MessagingCampaignBuilderPage.tsx"
Cohesion: 0.13
Nodes (21): AGE_STATUSES, AudienceBuilder(), replaceRules(), AudienceField, AudienceFilter, AudiencePreview, AudienceRule, audienceRuleForField() (+13 more)

### Community 66 - "compliance.service.ts"
Cohesion: 0.13
Nodes (13): COMPLIANCE_RULE_PUBLIC_SELECT, ComplianceDeadlineSnapshot, ComplianceRuleRow, ComplianceService, DIFF_FIELDS, diffRules(), PublicComplianceRule, serializeDiffValue() (+5 more)

### Community 67 - "1. IDEA CONTEXT (read this first)"
Cohesion: 0.50
Nodes (4): 1. IDEA CONTEXT (read this first), Non-negotiable project rules (apply to BOTH MVPs), The DPDP concepts you need, in plain language, What MVP 1 delivers when done

### Community 68 - "MVP1 Evaluation Against Spec Section 6"
Cohesion: 0.07
Nodes (28): Check 10: Conflicts are surfaced, not silently resolved (GO-03), Check 11: Purpose and lawful basis are never inferred (LB-02), Check 12: The registers actually answer s.11(1)(b) (RT-04), Check 13: A processor cannot go live without a contract (GO-02), Check 14: Credentials are encrypted and never leave the backend, Check 15: The access log records who looked at whom (SE-03, SE-05), Check 16: The audit log cannot be edited, Check 17: Sequence has no gaps (+20 more)

### Community 69 - "principal-auth.service.ts"
Cohesion: 0.10
Nodes (14): getDummyHash(), EmployeeAuthService, Injectable, LoginRequestMeta, Get, UseGuards, PRINCIPAL_ACCOUNT_PUBLIC_SELECT, PrincipalAuthService (+6 more)

### Community 70 - "roles.service.ts"
Cohesion: 0.11
Nodes (15): ApiProperty, ArrayUnique, IsArray, IsString, UpdateRolePermissionsDto, RolesController, ApiTags, Body (+7 more)

### Community 71 - "EmployeeAuthController"
Cohesion: 0.16
Nodes (13): EmployeeLoginDto, ApiProperty, IsEmail, IsString, MinLength, EmployeeAuthController, ApiTags, Body (+5 more)

### Community 72 - "read-only-http.client.ts"
Cohesion: 0.22
Nodes (9): defaultSleep(), ReadOnlyHttpClient, ReadOnlyHttpMethodError, ReadOnlyHttpRequestOptions, ReadOnlyHttpResponse, ReadOnlyHttpStatusError, ReadOnlyHttpTimeoutError, RETRY_BACKOFF_MS (+1 more)

### Community 73 - "seed.ts"
Cohesion: 0.05
Nodes (44): seedComplianceRules(), DEMO_EMPLOYEES, DEMO_ORG, DEMO_PASSWORD, DemoEmployeeSeed, main(), seedMessageTemplates(), SYSTEM_MESSAGE_TEMPLATES (+36 more)

### Community 75 - "CreateTransferDto"
Cohesion: 0.06
Nodes (31): CreateTransferDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional (+23 more)

### Community 76 - "router.tsx"
Cohesion: 0.02
Nodes (125): AppShell(), NAV_ITEMS, OrganizationSummary, loginAs(), AGREEMENT_LABEL, CandidateComparison(), CandidateComparisonProps, CandidateSignal (+117 more)

### Community 77 - "recipients.service.ts"
Cohesion: 0.06
Nodes (33): CreateRecipientDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional (+25 more)

### Community 78 - "BreachesController"
Cohesion: 0.19
Nodes (10): Actor, BreachesController, ApiTags, Body, Controller, Get, Param, Patch (+2 more)

### Community 79 - "retention.service.ts"
Cohesion: 0.06
Nodes (36): CreateRetentionPolicyDto, RETENTION_LEGAL_BASIS_TYPES, RETENTION_TRIGGER_TYPES, RETENTION_UNITS, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn (+28 more)

### Community 80 - "access-report-render.ts"
Cohesion: 0.42
Nodes (10): renderBoardDetailedPdf(), renderBoardInitialPdf(), ACCESS_REPORT_CSV_HEADER, renderAccessReportPdf(), renderPdf(), writePdfLetterhead(), writePdfLine(), writePdfSectionHeading() (+2 more)

### Community 81 - "DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS"
Cohesion: 0.17
Nodes (11): 1. IDEA CONTEXT (read this first), 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 2 GOAL (definition of done), DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS, Non-negotiable rules (carried from MVP 1, still binding), Notice · Consent · Children · Rights · Retention · Breach · Evidence, One new rule, specific to MVP 2 (+3 more)

### Community 82 - "dataset.test.ts"
Cohesion: 0.12
Nodes (18): seedDatabase(), selfCheck(), toSimRecords(), last6(), nameKey(), normalizeEmail(), normalizePhone(), SimCandidate (+10 more)

### Community 83 - "generateDataset"
Cohesion: 0.32
Nodes (11): formatDob(), generateDataset(), adultDob(), buildLinkedPair(), childDob(), fillSystemRecord(), nextEmail(), nextPhoneDigits() (+3 more)

### Community 84 - "purposes.service.ts"
Cohesion: 0.13
Nodes (15): CreatePurposeDto, ApiProperty, ApiPropertyOptional, IsArray, IsEnum, IsOptional, IsString, MinLength (+7 more)

### Community 85 - "retention.e2e-spec.ts"
Cohesion: 0.11
Nodes (14): CreateFromTriggerInput, PublicErasureTask, PreErasureNoticeSummary, PublicPurposeServedSignal, PURPOSE_SERVED_SIGNAL_PUBLIC_SELECT, PurposeServedService, RecordPurposeServedInput, Injectable (+6 more)

### Community 86 - "CreateComplianceRuleDto"
Cohesion: 0.17
Nodes (11): CreateComplianceRuleDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional (+3 more)

### Community 88 - "PrincipalAuthController"
Cohesion: 0.15
Nodes (13): PrincipalLoginDto, ApiProperty, IsEmail, IsString, MinLength, PrincipalAuthController, ApiTags, Body (+5 more)

### Community 89 - "ScopedTransactionClient"
Cohesion: 0.07
Nodes (41): ScopedTransactionClient, ApplyMatchResult, IdentifierOwnershipConflictError, initialPrincipalDisplayName(), LinkableNormalizedRecord, LinkingService, Injectable, customerIdSignal() (+33 more)

### Community 90 - "seed-scale.ts"
Cohesion: 0.18
Nodes (18): getOrCreateOrganization(), insertBatches(), main(), PERFORMANCE_PERMISSION_CODES, SCALE_APPROVER_EMAIL, SCALE_CONSENT_COUNT, SCALE_EMPLOYEE_PASSWORD, SCALE_OPERATOR_EMAIL (+10 more)

### Community 91 - "sync-pipeline.service.ts"
Cohesion: 0.07
Nodes (31): lockIdentifiersForOwnership(), describeSyncError(), MESSAGE_SAFE_ERROR_CLASSES, MissingRecordKeyError, IdentifierOwnershipConflictError, NotFoundException, PageCapExceededError, SomeFutureDomainError (+23 more)

### Community 92 - "mappings.controller.ts"
Cohesion: 0.21
Nodes (11): MappingWarningPurposeSummaryResponseDto, MappingWarningResponseDto, ApiProperty, MappingsResponseDto, SourceFieldMappingResponseDto, ApiProperty, DataSourcePurposeResponseDto, DataSourcePurposesResponseDto (+3 more)

### Community 93 - "connector.factory.ts"
Cohesion: 0.17
Nodes (6): ConnectorFactory, DataSourceRowForConnector, Injectable, Connector, ConnectorsModule, Module

### Community 94 - "VerifyGuardianDto"
Cohesion: 0.13
Nodes (13): ApiProperty, ApiPropertyOptional, IsEnum, IsOptional, IsString, MinLength, VerifyGuardianDto, GuardiansController (+5 more)

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
Cohesion: 0.06
Nodes (33): ReferenceService, Injectable, AgeService, ageStatusFor(), compareNewest(), DobCandidate, Injectable, AssembledField (+25 more)

### Community 99 - "NotificationsService"
Cohesion: 0.19
Nodes (7): NotificationSendInput, NotificationsService, Injectable, buildCancellationReason(), buildPreErasureNoticeBody(), PreErasureNoticeService, Injectable

### Community 100 - "BreachWizardPage.tsx"
Cohesion: 0.17
Nodes (11): BreachObligationCard(), countdown(), DataCategory, BreachDetailPage(), originalBoardDetailDueAt(), BreachWizardPage(), BreachWizardValues, buildBreachPayload() (+3 more)

### Community 101 - "sdf.module.ts"
Cohesion: 0.20
Nodes (10): SdfCycleScanProcessor, Processor, SDF_CYCLE_SCAN_CRON_PATTERN, SDF_CYCLE_SCAN_JOB_NAME, SDF_CYCLE_SCAN_QUEUE_NAME, SDF_CYCLE_SCAN_SCHEDULE_TRIGGERED_BY, SDF_CYCLE_SCAN_SCHEDULER_ID, SdfCycleScanJobData (+2 more)

### Community 102 - "merge-unmerge.e2e-spec.ts"
Cohesion: 0.13
Nodes (17): CandidateNormalizedRecord, CandidateSignal, isoDate(), MatchCandidateListItem, recordValueFor(), SIGNAL_FIELDS, SignalAgreement, activeLink() (+9 more)

### Community 103 - "deadline-scan.processor.ts"
Cohesion: 0.15
Nodes (12): DeadlineScanOrgResult, DeadlineScanProcessor, DeadlineScanSummary, Processor, DEADLINE_SCAN_CRON_PATTERN, DEADLINE_SCAN_JOB_NAME, DEADLINE_SCAN_QUEUE_NAME, DEADLINE_SCAN_SCHEDULE_TRIGGERED_BY (+4 more)

### Community 104 - "notifications.controller.ts"
Cohesion: 0.14
Nodes (18): CurrentNotificationActor, MarkAllReadResponseDto, NotificationDto, NotificationListResponseDto, ApiProperty, ApiPropertyOptional, JwtAnyActorGuard, NotificationCallerActor (+10 more)

### Community 105 - "retention.module.ts"
Cohesion: 0.16
Nodes (13): RetentionModule, Module, PreErasureNoticeProcessor, Processor, RetentionScanProcessor, Processor, PRE_ERASURE_NOTICE_QUEUE_NAME, PreErasureNoticeJobData (+5 more)

### Community 106 - "MeDataPage.tsx"
Cohesion: 0.16
Nodes (11): FIELD_LABELS, fieldLabel(), ValueCard(), ValueCardProps, ValueCardSource, CATEGORY_LABELS, categoryLabel(), MeDataCategoryGroupDto (+3 more)

### Community 107 - "access-report.service.ts"
Cohesion: 0.11
Nodes (16): AccessLogService, Injectable, AccessReportConsentEntry, AccessReportConsentHistoryEntry, AccessReportData, AccessReportProcessingActivity, AccessReportRecipient, AccessReportRetentionEntry (+8 more)

### Community 108 - "breach-principal-notice-dispatch.processor.ts"
Cohesion: 0.16
Nodes (13): BreachPrincipalNoticeDispatchProcessor, InjectQueue, Processor, BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME, BreachPrincipalNoticeDispatchJobData, breachPrincipalNoticeDispatchJobId(), CampaignSendProcessor, Processor (+5 more)

### Community 109 - "RetentionScanService"
Cohesion: 0.33
Nodes (3): RetentionScanService, Injectable, lockRetentionWorkflow()

### Community 110 - "data-sources-api.ts"
Cohesion: 0.04
Nodes (66): DataTable(), clickAction, columns, Row, errorLogEntries(), STATUS_VARIANT, SyncHistoryTable(), SyncHistoryTableProps (+58 more)

### Community 111 - "queues.module.ts"
Cohesion: 0.13
Nodes (11): AppConfig, BigInt, BREACH_CLOCK_QUEUE_NAME, toRedisConnectionOptions(), lockKey(), SYNC_LOCK_HEARTBEAT_INTERVAL_MS, SYNC_LOCK_PREFIX, SYNC_LOCK_TTL_MS (+3 more)

### Community 112 - "csvDocument"
Cohesion: 0.30
Nodes (4): renderAccessReportCsv(), EvidencePackService, Injectable, csvDocument()

### Community 113 - "children/types.ts"
Cohesion: 0.20
Nodes (10): GuardianConsentSelector(), GuardianConsentSelectorProps, GuardianKind, GuardianRelationship, GuardianVerification, guardianVerificationLabel(), isGuardianConsentEligible(), VERIFICATION_METHODS (+2 more)

### Community 114 - "SetMyConsentDto"
Cohesion: 0.10
Nodes (18): SetMyConsentDto, ApiProperty, ApiPropertyOptional, IsIn, IsObject, IsOptional, IsString, IsUUID (+10 more)

### Community 115 - "requests.controller.ts"
Cohesion: 0.11
Nodes (17): AddNoteDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsOptional, IsString, MinLength, AssignRequestDto (+9 more)

### Community 116 - "template-renderer.ts"
Cohesion: 0.13
Nodes (22): assertSimpleWhitelistedMustache(), DisallowedTemplateSyntaxError, engine, extractTemplateVariables(), MissingOrganizationContactError, MissingRequiredVariableError, OrganizationContactFields, renderMessageTemplate() (+14 more)

### Community 117 - "UpdatePurposeDto"
Cohesion: 0.09
Nodes (17): ApiPropertyOptional, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength, ValidateIf (+9 more)

### Community 118 - "PrismaService"
Cohesion: 0.04
Nodes (31): COMPLIANCE_RULE_SEEDS, ComplianceRuleSeed, GRIEVANCE_STATUTORY_BASELINE_RULE_CODE, seedGrievanceStatutoryBaseline(), extendWithTenantScoping(), PrismaService, Injectable, CreateRequestInput (+23 more)

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

### Community 124 - "CreateLegalHoldDto"
Cohesion: 0.21
Nodes (11): CreateLegalHoldDto, LegalHoldScopeDto, ApiProperty, ApiPropertyOptional, IsArray, IsDateString, IsOptional, IsString (+3 more)

### Community 125 - "auth.module.ts"
Cohesion: 0.33
Nodes (4): TenantModule, Module, AuthModule, Module

### Community 126 - "Public"
Cohesion: 0.14
Nodes (18): ApiExtraModels, CurrentPrincipal, Public(), JwtPrincipalGuard, PrincipalActor, Injectable, MePrivacyContactDto, ApiProperty (+10 more)

### Community 127 - "AppModule"
Cohesion: 0.09
Nodes (16): AppModule, Module, createManager(), createOrgWithRole(), ensurePermission(), createSourceRecord(), persist(), persistMappings() (+8 more)

### Community 128 - "ComplianceController"
Cohesion: 0.19
Nodes (8): ComplianceController, ApiTags, Body, Controller, Get, Param, Patch, Post

### Community 129 - "PDFDocument"
Cohesion: 0.13
Nodes (4): PDFDocument, PDFDocumentOptions, pdfkit, PDFTextOptions

### Community 130 - "TokenService"
Cohesion: 0.12
Nodes (7): IS_PUBLIC_KEY, JwtEmployeeGuard, Injectable, TenantMiddleware, Injectable, TokenService, Injectable

### Community 131 - "NotificationBell.tsx"
Cohesion: 0.20
Nodes (13): NotificationBell(), NotificationBellProps, NotificationRow(), EMPTY, RuleBasisChipProps, ApiClient, listNotifications(), markAllNotificationsRead() (+5 more)

### Community 132 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include (+1 more)

### Community 134 - "SyncQueueService"
Cohesion: 0.29
Nodes (4): SyncQueueService, syncSchedulerId(), Injectable, InjectQueue

### Community 135 - "Wave 1 — Engines (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I1, Task 2 — ComplianceService, rule versioning and the compliance-rules API, Task 3 — Template storage, whitelisted Handlebars rendering, and the fifteen system templates, Task 4 — The audience compiler and preview endpoint, Task 5 — Mail transport, notification providers and the notifications API, Wave 1 — Engines (4 parallel + integrator)

### Community 136 - "InventoryService"
Cohesion: 0.14
Nodes (10): InventoryController, ApiTags, Controller, Get, Res, InventoryService, Injectable, RopaExportService (+2 more)

### Community 137 - "sync.service.ts"
Cohesion: 0.09
Nodes (21): DEFAULT_SYNC_JOB_LIST_LIMIT, ListSyncJobsQueryDto, MAX_SYNC_JOB_LIST_LIMIT, IsInt, IsOptional, IsString, Max, Min (+13 more)

### Community 141 - "Wave 2 — Domain services, part one (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I2, Task 6 — The rights request engine and `deadline-scan`, Task 7 — The notice builder, Task 8 — Children, guardians and exemption claims, Task 9 — Retention core, the floor, legal holds and the retention jobs, Wave 2 — Domain services, part one (4 parallel + integrator)

### Community 142 - "UpdateAlgorithmEntryDto"
Cohesion: 0.10
Nodes (17): ALGORITHM_ENTRY_PUBLIC_SELECT, AlgorithmRegisterService, PublicAlgorithmEntry, Injectable, ALGORITHM_OPERATIONS, AlgorithmOperation, ApiPropertyOptional, ArrayMinSize (+9 more)

### Community 143 - "Wave 3 — Domain services, part two (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I3, Task 10 — Consent records, events, backfill and one-click withdrawal, Task 11 — Campaigns, the eight send guards, and delivery, Task 12 — Access report, per-principal evidence, chain verification and the evidence pack, Task 13 — SDF pack, Board and Government interaction, Wave 3 — Domain services, part two (4 parallel + integrator)

### Community 144 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, preview, test, test:watch, typecheck

### Community 145 - "ReplaceMappingsDto"
Cohesion: 0.17
Nodes (12): ReplaceMappingsDto, SourceFieldMappingDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsEnum, IsOptional (+4 more)

### Community 146 - "audit-read.service.ts"
Cohesion: 0.18
Nodes (10): ACCESS_LOG_CSV_HEADER, ACCESS_LOG_ENTRY_SELECT, AccessLogEntryRow, AUDIT_EVENT_LIST_SELECT, AuditEventListItem, AuditEventListResult, AuditEventListRow, AccessLogExportDto (+2 more)

### Community 147 - "frontend/package.json"
Cohesion: 0.29
Nodes (6): description, license, name, private, type, version

### Community 149 - "EmployeeMeResponseDto"
Cohesion: 0.67
Nodes (3): EmployeeMeResponseDto, EmployeeMeRoleDto, ApiProperty

### Community 150 - "Wave 6 — Frontend, part one (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I5, Task 17 — `/app/requests`, `/app/requests/:ref`, `/app/settings/rights`, Task 18 — `/app/notices`, `/app/consents`, `/app/settings/compliance`, Task 19 — `/app/children`, `/app/retention`, Task 20 — The Data Principal portal, Wave 6 — Frontend, part one (4 parallel + integrator)

### Community 151 - "Wave 7 — Frontend, part two (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I6, Task 21 — `/app/messaging/templates`, `/app/messaging/campaigns`, the audience builder UI, Task 22 — `/app/breaches` and the creation wizard, Task 23 — `/app/sdf` and `/app/information-requests`, Task 24 — `/app/principals/:id/evidence`, audit UI and dashboard tiles, Wave 7 — Frontend, part two (4 parallel + integrator)

### Community 154 - "notifications.module.ts"
Cohesion: 0.18
Nodes (15): MailModule, Module, MailMessage, MailConfig, EMAIL_PROVIDER, selectEmailProvider(), NotificationAudience, NotificationChannel (+7 more)

### Community 155 - "MappingsController"
Cohesion: 0.27
Nodes (8): MappingsController, ApiOkResponse, ApiTags, Body, Controller, Get, Param, Put

### Community 157 - "UpdateComplianceRuleDto"
Cohesion: 0.18
Nodes (10): ApiPropertyOptional, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min (+2 more)

### Community 162 - "LineageService"
Cohesion: 0.13
Nodes (6): MeService, Injectable, LineageService, Injectable, PrincipalRecipientsService, Injectable

### Community 163 - "templates.service.ts"
Cohesion: 0.13
Nodes (16): PreviewTemplateDto, ApiPropertyOptional, IsObject, IsOptional, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean (+8 more)

### Community 164 - "CompleteErasureTaskDto"
Cohesion: 0.23
Nodes (11): CompleteErasureTaskDto, ProcessorChecklistTickDto, SystemChecklistTickDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsOptional (+3 more)

### Community 165 - "mappings.e2e-spec.ts"
Cohesion: 0.14
Nodes (10): jsonHandler(), MockHttpServer, startRecordsServer(), createEmployee(), createOrg(), createOrgWithBothPermissions(), ensurePermission(), startRecordsServer() (+2 more)

### Community 166 - "registers.e2e-spec.ts"
Cohesion: 0.39
Nodes (8): authed(), createDataSource(), createEmployeeWithPermissions(), createOrgWithManager(), createPurpose(), createRecipient(), ensurePermission(), recipientPayload()

### Community 167 - "Wave 4 — Breach and the remaining jobs (2 parallel + integrator)"
Cohesion: 0.50
Nodes (4): Integrator I4, Task 14 — The breach module, Task 15 — The remaining scheduled jobs and the scheduler consolidation, Wave 4 — Breach and the remaining jobs (2 parallel + integrator)

### Community 168 - "CreateAlgorithmEntryDto"
Cohesion: 0.09
Nodes (21): CreateAlgorithmEntryDto, ApiProperty, ApiPropertyOptional, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn (+13 more)

### Community 175 - "zip-writer.ts"
Cohesion: 0.47
Nodes (5): buildZip(), crc32(), CRC_TABLE, toDosDateTime(), ZipEntryInput

### Community 177 - "PrincipalEvidenceService"
Cohesion: 0.21
Nodes (8): PrincipalEvidenceController, ApiTags, Controller, Get, Param, Res, PrincipalEvidenceService, Injectable

### Community 178 - "canonicalJson"
Cohesion: 0.21
Nodes (10): canonicalJson(), Custom, stringify(), typeLabel(), AuditChainService, Event, serviceWith(), Injectable (+2 more)

### Community 179 - "access-log-retention.processor.ts"
Cohesion: 0.12
Nodes (16): ACCESS_LOG_RETENTION_FLOOR_DAYS, EnvironmentVariables, IsIn, IsInt, IsNotEmpty, IsString, Min, MinLength (+8 more)

### Community 180 - "app.module.ts"
Cohesion: 0.07
Nodes (46): AuditModule, Module, MaskingModule, Module, ReferenceModule, Module, AuditReadModule, Module (+38 more)

### Community 181 - "data-sources.module.ts"
Cohesion: 0.24
Nodes (8): DataSourcesModule, Module, NormalizationModule, Module, SyncModule, Module, QueuesModule, Module

### Community 183 - "ListRequestsDto"
Cohesion: 0.25
Nodes (6): ListRequestsDto, IsBoolean, IsEnum, IsOptional, IsString, Transform

### Community 184 - "ListAuditEventsDto"
Cohesion: 0.15
Nodes (13): AUDIT_ACTIONS, NOTE: the spec's §4.7 prose claims "33 MVP 1 action names", but the, AUDIT_EVENTS_PAGE_SIZE, ListAuditEventsDto, MAX_AUDIT_EVENTS_PAGE, IsIn, IsInt, IsOptional (+5 more)

### Community 185 - "masking.service.ts"
Cohesion: 0.27
Nodes (7): CAN_VIEW_ALL_PERSONAL_DATA, PASS_THROUGH_FIELDS, InventoryGap, InventorySummary, NON_PERSONAL_DATA_CANONICAL_FIELDS, RecentAuditEvent, ShortfallCounts

### Community 187 - "AuditReadService"
Cohesion: 0.25
Nodes (4): AuditReadService, Injectable, AuditExportService, Injectable

### Community 188 - "evidence-pack.service.ts"
Cohesion: 0.19
Nodes (9): AUDIT_LOG_CSV_HEADER, formatEvidenceTimestamp(), withCsvLetterhead(), csvField(), csvRow(), needsQuoting(), RFC-4180, RFC-4180 (+1 more)

### Community 191 - "CreateCampaignDto"
Cohesion: 0.18
Nodes (10): CreateCampaignDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsEnum, IsObject, IsOptional (+2 more)

### Community 192 - "source-purposes.service.ts"
Cohesion: 0.27
Nodes (8): AttachPurposesDto, ApiProperty, ArrayUnique, IsArray, IsString, DataSourcePurposesResult, ReplacePurposesResult, PublicPurpose

### Community 193 - "MVP2 Evaluation Against Spec Sections 6 and 7"
Cohesion: 0.22
Nodes (8): Executive result, Known gaps and follow-up, Live sync setup diagnosis, MVP2 Evaluation Against Spec Sections 6 and 7, Runtime pre-flight, Section 6 evidence totals, Section 6 matrix (all 36 checks), Section 7 live walkthrough (34 steps)

### Community 201 - "TemplatesService"
Cohesion: 0.15
Nodes (10): TemplatesController, ApiTags, Body, Controller, Param, Patch, Post, duplicateCodeMessage() (+2 more)

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
Nodes (31): CurrentActorPermissions, PERMISSION_KEY, RequirePermission(), PermissionsRequest, Get, Query, ChainVerificationResult, AuditEventsEvidenceController (+23 more)

### Community 206 - "AuditReadController"
Cohesion: 0.28
Nodes (6): AuditReadController, ApiTags, Controller, Get, Query, Res

### Community 207 - "ChangeStatusDto"
Cohesion: 0.23
Nodes (13): ChangeStatusDto, ErasureProcessorChecklistDto, ErasureSystemChecklistDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsEnum (+5 more)

### Community 208 - "consents.module.ts"
Cohesion: 0.13
Nodes (15): ChildrenModule, Module, ConsentBackfillService, Injectable, ConsentsModule, Module, AUDIT_CHAIN_VERIFY_QUEUE_NAME, ConsentBackfillProcessor (+7 more)

### Community 209 - "VerifyIdentityDto"
Cohesion: 0.29
Nodes (6): ApiProperty, ApiPropertyOptional, IsOptional, IsString, MinLength, VerifyIdentityDto

### Community 210 - "CreateTemplateDto"
Cohesion: 0.22
Nodes (9): CreateTemplateDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsEnum, IsOptional, IsString (+1 more)

### Community 211 - "PrismaModule"
Cohesion: 0.67
Nodes (3): PrismaModule, Module, Global

### Community 212 - "notifications.service.ts"
Cohesion: 0.28
Nodes (5): NOTIFICATION_PUBLIC_SELECT, NotificationRow, ownershipWhere(), PublicNotification, toPublicNotification()

### Community 213 - "RequestsController"
Cohesion: 0.21
Nodes (9): RequestsController, ApiTags, Body, Controller, Get, Param, Post, Query (+1 more)

### Community 214 - "EvidencePackController"
Cohesion: 0.29
Nodes (5): EvidencePackController, ApiTags, Controller, Get, Res

### Community 216 - "tenant-context.js"
Cohesion: 0.33
Nodes (4): isThenable(), storage, node_async_hooks_1, run()

### Community 217 - "SourcePurposesService"
Cohesion: 0.38
Nodes (3): SourcePurposesService, Injectable, toPublicPurpose()

### Community 220 - "MeRecipientsPage"
Cohesion: 0.29
Nodes (4): categoryLabel(), MeRecipientsPage(), recipientTypeLabel(), MOCK_RECIPIENTS

### Community 221 - "guardians.service.ts"
Cohesion: 0.08
Nodes (24): TenantScopedPrismaClient, APPOINTING_AUTHORITIES, AppointingAuthority, CreateGuardianDto, ApiProperty, ApiPropertyOptional, IsEmail, IsEnum (+16 more)

### Community 222 - "PermissionsController"
Cohesion: 0.33
Nodes (4): PermissionsController, ApiTags, Controller, Get

### Community 224 - ".constructor"
Cohesion: 0.33
Nodes (3): CampaignSendQueueService, Injectable, InjectQueue

### Community 225 - "PortalProvider"
Cohesion: 0.40
Nodes (3): PortalProvider, Injectable, Inject

### Community 226 - "AddMeRequestCommentDto"
Cohesion: 0.40
Nodes (4): AddMeRequestCommentDto, ApiProperty, IsString, MinLength

### Community 227 - "FlagFrivolousDto"
Cohesion: 0.40
Nodes (4): FlagFrivolousDto, ApiProperty, IsString, MinLength

### Community 228 - "LanguageSelector.tsx"
Cohesion: 0.40
Nodes (3): LanguageSelectorProps, NOTICE_LANGUAGES, NoticeLanguageCode

### Community 229 - "useCountdown.ts"
Cohesion: 0.60
Nodes (3): computeRemaining(), CountdownState, useCountdown()

### Community 230 - "Grievance statutory-baseline fix report"
Cohesion: 0.50
Nodes (3): Grievance statutory-baseline fix report, Implemented, Verification

## Knowledge Gaps
- **1105 isolated node(s):** `name`, `version`, `private`, `description`, `main` (+1100 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequirePermission()` connect `RequirePermission` to `ComplianceController`, `InventoryService`, `sync.service.ts`, `UpdateOrganizationDto`, `UpdateAlgorithmEntryDto`, `security-measures.service.ts`, `breach.service.ts`, `CreateVoluntaryUndertakingDto`, `MappingsController`, `data-sources.service.ts`, `employees.service.ts`, `CreateInformationRequestDto`, `CampaignsService`, `templates.service.ts`, `CreateAlgorithmEntryDto`, `CreateSharingActivityDto`, `ConsentsService`, `DataSourcesService`, `PrincipalEvidenceService`, `age-status.service.ts`, `notices.service.ts`, `AccessTokenPayload`, `child-exemptions.service.ts`, `sdf-assessment.service.ts`, `roles.service.ts`, `TemplatesService`, `CandidatesService`, `CreateTransferDto`, `recipients.service.ts`, `BreachesController`, `AuditReadController`, `access-report-render.ts`, `retention.service.ts`, `RequestsController`, `EvidencePackController`, `mappings.controller.ts`, `PermissionsController`, `VerifyGuardianDto`, `requests.controller.ts`, `UpdatePurposeDto`, `PrismaService`, `.unmerge`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `PrismaService` to `sync.service.ts`, `UpdateAlgorithmEntryDto`, `security-measures.service.ts`, `audit-read.service.ts`, `requests.service.ts`, `breach.service.ts`, `erasure-task.service.ts`, `CreateVoluntaryUndertakingDto`, `campaigns.service.ts`, `notifications.module.ts`, `data-sources.service.ts`, `employees.service.ts`, `principals.e2e-spec.ts`, `LineageService`, `templates.service.ts`, `mappings.service.ts`, `me-rights.service.ts`, `principals.service.ts`, `mappings.e2e-spec.ts`, `registers.e2e-spec.ts`, `CreateSharingActivityDto`, `canonicalJson`, `age-status.service.ts`, `notices.service.ts`, `access-log-retention.processor.ts`, `BootRegistrationRegistry`, `child-exemptions.service.ts`, `masking.service.ts`, `prisma.service.ts`, `evidence-pack.service.ts`, `sdf-assessment.service.ts`, `source-purposes.service.ts`, `compliance.service.ts`, `principal-auth.service.ts`, `roles.service.ts`, `seed.ts`, `compile-audience.ts`, `CreateTransferDto`, `RequirePermission`, `recipients.service.ts`, `retention.service.ts`, `notifications.service.ts`, `purposes.service.ts`, `retention.e2e-spec.ts`, `ScopedTransactionClient`, `seed-scale.ts`, `sync-pipeline.service.ts`, `notifications.e2e-spec.ts`, `guardians.service.ts`, `assembly.service.ts`, `merge-unmerge.e2e-spec.ts`, `deadline-scan.processor.ts`, `notifications.controller.ts`, `access-report.service.ts`, `breach-principal-notice-dispatch.processor.ts`, `Public`, `AppModule`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `AuditService` connect `prisma.service.ts` to `InventoryService`, `UpdateOrganizationDto`, `UpdateAlgorithmEntryDto`, `security-measures.service.ts`, `audit-read.service.ts`, `requests.service.ts`, `breach.service.ts`, `.record`, `erasure-task.service.ts`, `CreateVoluntaryUndertakingDto`, `campaigns.service.ts`, `data-sources.service.ts`, `employees.service.ts`, `CreateInformationRequestDto`, `templates.service.ts`, `mappings.service.ts`, `me-rights.service.ts`, `MeRightsService`, `CreateSharingActivityDto`, `PrincipalEvidenceService`, `age-status.service.ts`, `app.module.ts`, `notices.service.ts`, `child-exemptions.service.ts`, `AuditReadService`, `evidence-pack.service.ts`, `sdf-assessment.service.ts`, `source-purposes.service.ts`, `compliance.service.ts`, `principal-auth.service.ts`, `roles.service.ts`, `TemplatesService`, `CreateTransferDto`, `recipients.service.ts`, `retention.service.ts`, `purposes.service.ts`, `retention.e2e-spec.ts`, `SourcePurposesService`, `ScopedTransactionClient`, `SdfCycleScanService`, `sync-pipeline.service.ts`, `connector.factory.ts`, `guardians.service.ts`, `.constructor`, `assembly.service.ts`, `NotificationsService`, `merge-unmerge.e2e-spec.ts`, `access-report.service.ts`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _1105 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Consent & Breach Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `DPDP Compliance Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._