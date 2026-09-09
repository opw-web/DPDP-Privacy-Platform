# Graph Report - DPDP-Privacy-Platform  (2026-09-09)

## Corpus Check
- 713 files · ~2,642,003 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5318 nodes · 13550 edges · 204 communities (182 shown, 15 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 427 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `38802171`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Consent & Breach Checklist
- DPDP Compliance Checklist
- 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)
- 4. REQUIREMENTS
- devDependencies
- 2. ARCHITECTURE
- @prisma/client
- Tasks
- compilerOptions
- AuditService
- UpdateOrganizationDto
- scripts
- nest-cli.json
- jest.config.ts
- tenant.extension.ts
- BreachPrincipalNoticeDispatchProcessor
- card.tsx
- .me
- dependencies
- AuditPage.tsx
- ChangeStatusDto
- DeadlinePill.tsx
- RequirePermission
- CreateExemptionClaimDto
- CreateVoluntaryUndertakingDto
- campaigns.service.ts
- common.sh
- ConsentBackfillService
- employees.controller.ts
- CreateInformationRequestDto
- retention/retention.controller.ts
- react
- CampaignsService
- demo-company-server/package.json
- queues.module.ts
- router.tsx
- SyncPipelineService
- PrincipalsService
- compile-audience.ts
- CreateSharingActivityDto
- SetMyConsentDto
- server.ts
- AuditPage
- NoticeBuilderPage.tsx
- PreErasureNoticeService
- ConsentsService
- compilerOptions
- tsconfig.seed.json
- DataSourcesController
- BreachService
- AudienceService
- notices.service.ts
- access-log-retention.processor.ts
- PrismaService
- generate.ts
- backend/package.json
- AgeStatusService
- rest-api.connector.ts
- demo-company-server
- ReplaceMappingsDto
- .markRead
- 4. REQUIREMENTS
- devDependencies
- DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING
- EmployeesPage.tsx
- test-database.ts
- 1. IDEA CONTEXT (read this first)
- MVP1 Evaluation Against Spec Section 6
- BreachWizardPage.tsx
- UpdateRolePermissionsDto
- EmployeeAuthController
- audit-read.service.ts
- normalization.service.ts
- RetentionScanService
- ScopedTransactionClient
- @tanstack/react-query
- CreateRecipientDto
- TokenService
- CreateRetentionPolicyDto
- security-measures.service.ts
- DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS
- dataset.test.ts
- generateDataset
- candidates.controller.ts
- data-sources.service.ts
- AuditChainService
- .record
- PrincipalAuthController
- CandidateComparison.tsx
- seed-scale.ts
- cn
- UpdateAlgorithmEntryDto
- @nestjs/config
- CreateMeRequestDto
- DPDP Platform MVP 2 — Compliance Operations — Implementation Plan
- 2. ARCHITECTURE
- compilerOptions
- MessagingCampaignBuilderPage.tsx
- main.ts
- PrincipalEvidenceController
- MaskingService
- UpdateMeNominationDto
- Public
- DPDP Privacy Platform — Client Evaluation
- @nestjs/common
- UpdateComplianceRuleDto
- guardians.controller.ts
- DeadlineScanProcessor
- access-report-render.ts
- data-sources-api.ts
- token.service.ts
- csvDocument
- children/types.ts
- .remove
- notifications.module.ts
- CreateAlgorithmEntryDto
- audit-read.controller.ts
- supertest
- .unmerge
- routes.test.ts
- AddNoteDto
- Waves and Tasks
- dependencies
- ListSyncJobsQueryDto
- DataSourcesService
- MeRightsService
- seed.ts
- sync-lock.service.ts
- PDFDocument
- DateTime.tsx
- canonicalJson
- compilerOptions
- inventory.service.ts
- CreateTransferDto
- Wave 1 — Engines (4 parallel + integrator)
- InventoryService
- SyncService
- CreateCampaignDto
- capture-guide-screenshots.mjs
- SdfController
- Wave 2 — Domain services, part one (4 parallel + integrator)
- RequestsService
- Wave 3 — Domain services, part two (4 parallel + integrator)
- scripts
- dedupe-vault-names.py
- breach.types.ts
- frontend/package.json
- CreateBreachDto
- UpdateDataSourceDto
- Wave 6 — Frontend, part one (4 parallel + integrator)
- Wave 7 — Frontend, part two (4 parallel + integrator)
- csv-writer.ts
- vite-env.d.ts
- CreatePurposeDto
- build-standalone.py
- Step 6 current-head live rerun — network results (FAILED acceptance)
- eslint.config.js
- Wave 4 — Breach and the remaining jobs (2 parallel + integrator)
- principals.controller.ts
- mapping-warning-response.dto.ts
- createApiClient
- vite.config.ts
- prisma
- CreateDataSourceDto
- ListRequestsDto
- UpdateBreachDto
- app.module.ts
- PrismaModule
- CompleteObligationDto
- 0 - Prepare This Computer.sh
- PermissionsController
- AssignRequestDto
- 1 - Start Privacy Demo.sh
- 2 - Client Guide.sh
- sync.e2e-spec.ts
- VerifyIdentityDto
- MVP2 Evaluation Against Spec Sections 6 and 7
- 3 - Open Database.sh
- 4 - Show Demo Proof.sh
- 5 - Demo Status.sh
- 6 - Stop Privacy Demo.sh
- 9 - Reset Demo to Fresh State.sh
- EvidencePackController
- TemplatesService
- PreviewAudienceDto
- zip-writer.ts
- EscalateRequestDto
- BreachesController
- SyncQueueService
- formatEvidenceTimestamp
- RequestsController
- tenant-context.js
- Grievance statutory-baseline fix report
- LanguageSelector.tsx
- principals.service.ts
- SdfCycleScanService
- @nestjs/swagger

## God Nodes (most connected - your core abstractions)
1. `@nestjs/common` - 233 edges
2. `RequirePermission()` - 182 edges
3. `PrismaService` - 132 edges
4. `@prisma/client` - 125 edges
5. `@nestjs/swagger` - 119 edges
6. `@tanstack/react-query` - 109 edges
7. `AuditService` - 107 edges
8. `react` - 83 edges
9. `react-router-dom` - 77 edges
10. `class-validator` - 76 edges

## Surprising Connections (you probably didn't know these)
- `RequireEmployeeAuth()` --calls--> `useEmployeeAuth()`  [EXTRACTED]
  dpdp-platform/frontend/src/router.tsx → dpdp-platform/frontend/src/lib/auth.ts
- `seedDatabase()` --calls--> `openDb()`  [EXTRACTED]
  demo-company-server/src/seed/generate.ts → demo-company-server/src/db.ts
- `ecommerceRoutes()` --indirect_call--> `onlyGet()`  [INFERRED]
  demo-company-server/src/routes/ecommerce.ts → demo-company-server/src/methodGate.ts
- `marketingRoutes()` --indirect_call--> `onlyGet()`  [INFERRED]
  demo-company-server/src/routes/marketing.ts → demo-company-server/src/methodGate.ts
- `salesRoutes()` --indirect_call--> `onlyGet()`  [INFERRED]
  demo-company-server/src/routes/sales.ts → demo-company-server/src/methodGate.ts

## Import Cycles
- None detected.

## Communities (204 total, 15 thin omitted)

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
Cohesion: 0.08
Nodes (26): devDependencies, eslint, eslint-config-prettier, eslint-plugin-prettier, jest, @nestjs/cli, @nestjs/schematics, @nestjs/testing (+18 more)

### Community 5 - "2. ARCHITECTURE"
Cohesion: 0.22
Nodes (9): 2.1 Tech stack (locked — do not substitute), 2.2 Machine setup — Linux Mint Cinnamon (run these exactly), 2.3 Ports (locked), 2.4 Folder structure, 2.5 Database schema — Prisma (source of truth), 2.6 Raw SQL Prisma cannot express (second migration), 2.7 docker-compose.yml and .env, 2.8 The sync pipeline (+1 more)

### Community 6 - "@prisma/client"
Cohesion: 0.07
Nodes (29): SYSTEM_MESSAGE_TEMPLATES, SystemMessageTemplateSeed, PublicVoluntaryUndertaking, VOLUNTARY_UNDERTAKING_PUBLIC_SELECT, APPLIES_TO_BY_REQUEST_TYPE, DEADLINE_SCAN_ACTOR_LABEL, DEADLINE_WARNING_EVENT_NOTE, ERASURE_STATUTORY_GROUND_TEXT (+21 more)

### Community 7 - "Tasks"
Cohesion: 0.05
Nodes (36): DPDP Platform MVP 1 — Implementation Plan, File Structure, Global Constraints, Risks and rulings taken up front, Task 10: Demo dataset generator — 500 records, 327 people, and the traps, Task 11: RestApiConnector with a GET-only HTTP client, Task 12: Data-source CRUD and credential encryption, Task 13: Field mapping, purpose attachment and the data-minimisation warning (+28 more)

### Community 8 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+16 more)

### Community 9 - "AuditService"
Cohesion: 0.03
Nodes (66): AccessLogService, RecordPersonalDataViewedInput, Injectable, AuditAction, NOTE: the spec's §4.7 prose claims "33 MVP 1 action names", but the, AuditRecordInput, AuditService, FORBIDDEN_METADATA_KEY_FRAGMENTS (+58 more)

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

### Community 16 - "BreachPrincipalNoticeDispatchProcessor"
Cohesion: 0.40
Nodes (3): BreachPrincipalNoticeDispatchProcessor, InjectQueue, Processor

### Community 17 - "card.tsx"
Cohesion: 0.04
Nodes (87): IS_LEGAL_BASIS, LABEL, RuleBasisChip(), RuleBasisChipProps, VARIANT, Badge(), BadgeProps, badgeVariants (+79 more)

### Community 18 - ".me"
Cohesion: 0.33
Nodes (5): EmployeeMeResponseDto, EmployeeMeRoleDto, ApiProperty, ApiOkResponse, Get

### Community 19 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, argon2, bullmq, class-transformer, class-validator, cookie-parser, date-fns, date-fns-tz (+19 more)

### Community 20 - "AuditPage.tsx"
Cohesion: 0.07
Nodes (43): DataTableProps, EmptyStateConfig, EmptyState(), EmptyStateAction, EmptyStateProps, Table, TableBody, TableCell (+35 more)

### Community 21 - "ChangeStatusDto"
Cohesion: 0.23
Nodes (13): ChangeStatusDto, ErasureProcessorChecklistDto, ErasureSystemChecklistDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsEnum (+5 more)

### Community 22 - "DeadlinePill.tsx"
Cohesion: 0.16
Nodes (11): BADGE_VARIANT, Band, bandFor(), DeadlinePill(), DeadlinePillProps, computeRemaining(), CountdownState, useCountdown() (+3 more)

### Community 23 - "RequirePermission"
Cohesion: 0.06
Nodes (32): CurrentActor, RequirePermission(), AccessTokenPayload, CampaignsController, ApiTags, Body, Controller, Get (+24 more)

### Community 24 - "CreateExemptionClaimDto"
Cohesion: 0.09
Nodes (21): ChildExemptionsController, ApiTags, Body, Controller, Get, Post, Query, ChildExemptionsService (+13 more)

### Community 25 - "CreateVoluntaryUndertakingDto"
Cohesion: 0.05
Nodes (37): CreateVoluntaryUndertakingDto, ApiProperty, ApiPropertyOptional, IsArray, IsDateString, IsOptional, IsString, MinLength (+29 more)

### Community 26 - "campaigns.service.ts"
Cohesion: 0.09
Nodes (38): ActiveNonDisclosureDirection, recordNonDisclosureSuppression(), CAMPAIGN_PUBLIC_SELECT, CAMPAIGN_RECIPIENT_PUBLIC_SELECT, CHILD_LIKE_AGE_STATUSES, COMPLIANCE_CATEGORIES, PublicCampaign, PublicCampaignRecipient (+30 more)

### Community 27 - "common.sh"
Cohesion: 0.06
Nodes (78): backend_healthy(), demo_healthy(), ensure_backend_up(), ensure_database_up(), ensure_demo_company_up(), ensure_frontend_up(), ensure_studio_up(), free_port_if_stale() (+70 more)

### Community 28 - "ConsentBackfillService"
Cohesion: 0.28
Nodes (4): ConsentBackfillService, Injectable, ConsentBackfillProcessor, Processor

### Community 29 - "employees.controller.ts"
Cohesion: 0.08
Nodes (25): CreateEmployeeDto, ApiProperty, IsEmail, IsString, MinLength, ResetEmployeePasswordDto, ApiProperty, IsString (+17 more)

### Community 30 - "CreateInformationRequestDto"
Cohesion: 0.06
Nodes (31): CreateInformationRequestDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn (+23 more)

### Community 31 - "retention/retention.controller.ts"
Cohesion: 0.09
Nodes (27): CancelErasureTaskDto, ApiProperty, IsString, MinLength, CompleteErasureTaskDto, ProcessorChecklistTickDto, SystemChecklistTickDto, ApiProperty (+19 more)

### Community 32 - "react"
Cohesion: 0.03
Nodes (152): PermissionGate(), Button, ButtonProps, buttonVariants, CardDescription, CheckboxOption, CheckboxOptionProps, Input (+144 more)

### Community 33 - "CampaignsService"
Cohesion: 0.12
Nodes (9): CampaignsService, notFoundCampaign(), toBadRequest(), Injectable, CampaignSendProcessor, Processor, CampaignSendQueueService, Injectable (+1 more)

### Community 34 - "demo-company-server/package.json"
Cohesion: 0.08
Nodes (24): dependencies, better-sqlite3, fastify, description, devDependencies, ts-node, @types/better-sqlite3, @types/node (+16 more)

### Community 35 - "queues.module.ts"
Cohesion: 0.08
Nodes (41): ACCESS_LOG_RETENTION_QUEUE_NAME, AUDIT_CHAIN_VERIFY_QUEUE_NAME, BREACH_CLOCK_QUEUE_NAME, CONSENT_BACKFILL_QUEUE_NAME, CONSENT_BACKFILL_SCHEDULE_TRIGGERED_BY, ConsentBackfillJobData, ConsentBackfillQueueService, Injectable (+33 more)

### Community 36 - "router.tsx"
Cohesion: 0.08
Nodes (29): BreachesPage(), DataSourceNewPage(), MessagingCampaignsPage(), MessagingTemplatesPage(), NoticesPage(), RequestDetailPage(), SettingsCompliancePage(), SettingsPage() (+21 more)

### Community 37 - "SyncPipelineService"
Cohesion: 0.11
Nodes (15): describeSyncError(), MESSAGE_SAFE_ERROR_CLASSES, MissingRecordKeyError, IdentifierOwnershipConflictError, NotFoundException, PageCapExceededError, SomeFutureDomainError, SyncErrorDescription (+7 more)

### Community 38 - "PrincipalsService"
Cohesion: 0.09
Nodes (10): AccessReportService, Injectable, MeService, Injectable, LineageService, Injectable, PrincipalRecipientsService, Injectable (+2 more)

### Community 39 - "compile-audience.ts"
Cohesion: 0.14
Nodes (34): AudienceFilterError, AUDIENCE_FILTER_FIELDS, AUDIENCE_FILTER_OPERATORS, AudienceFilter, AudienceFilterField, AudienceFilterGroup, AudienceFilterNode, AudienceFilterOperator (+26 more)

### Community 40 - "CreateSharingActivityDto"
Cohesion: 0.06
Nodes (32): CreateSharingActivityDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum (+24 more)

### Community 41 - "SetMyConsentDto"
Cohesion: 0.10
Nodes (18): SetMyConsentDto, ApiProperty, ApiPropertyOptional, IsIn, IsObject, IsOptional, IsString, IsUUID (+10 more)

### Community 42 - "server.ts"
Cohesion: 0.31
Nodes (16): requireBearer(), System, SYSTEM_KEYS, openDb(), onlyGet(), envelope(), PageParams, parsePageParams() (+8 more)

### Community 43 - "AuditPage"
Cohesion: 0.28
Nodes (6): AuditPage(), downloadEvidencePack(), exportAccessLog(), exportAudit(), buildQueryString(), saveBlob()

### Community 44 - "NoticeBuilderPage.tsx"
Cohesion: 0.14
Nodes (23): NoticeComposer(), NoticeComposerProps, NoticeDraftValues, NoticePreviewProps, NoticeStandalonePreview(), EligibleItemisedField, Notice, NOTICE_LANGUAGES (+15 more)

### Community 45 - "PreErasureNoticeService"
Cohesion: 0.23
Nodes (6): buildCancellationReason(), buildPreErasureNoticeBody(), PreErasureNoticeService, Injectable, PreErasureNoticeProcessor, Processor

### Community 46 - "ConsentsService"
Cohesion: 0.08
Nodes (20): ConsentsController, ApiTags, Body, Controller, Get, Param, Post, Req (+12 more)

### Community 47 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 48 - "tsconfig.seed.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, outDir, rootDir, exclude, extends, ../tsconfig.json

### Community 49 - "DataSourcesController"
Cohesion: 0.17
Nodes (8): DataSourcesController, ApiTags, Body, Controller, Get, Param, Patch, Post

### Community 50 - "BreachService"
Cohesion: 0.18
Nodes (7): asDate(), BreachService, Injectable, PublicBreach, BreachClockProcessor, Processor, breachPrincipalNoticeDispatchJobId()

### Community 51 - "AudienceService"
Cohesion: 0.25
Nodes (5): AudienceController, ApiTags, Controller, AudienceService, Injectable

### Community 52 - "notices.service.ts"
Cohesion: 0.06
Nodes (38): CreateNoticeDto, ApiProperty, ArrayMinSize, ArrayUnique, IsArray, IsString, MinLength, CreateNoticeVersionDto (+30 more)

### Community 53 - "access-log-retention.processor.ts"
Cohesion: 0.11
Nodes (17): ACCESS_LOG_RETENTION_FLOOR_DAYS, AppConfig, EnvironmentVariables, IsIn, IsInt, IsNotEmpty, IsString, Min (+9 more)

### Community 54 - "PrismaService"
Cohesion: 0.04
Nodes (61): COMPLIANCE_RULE_SEEDS, ComplianceRuleSeed, GRIEVANCE_STATUTORY_BASELINE_RULE_CODE, seedComplianceRules(), extendWithTenantScoping(), PrismaService, Injectable, TenantContext (+53 more)

### Community 55 - "generate.ts"
Cohesion: 0.09
Nodes (24): ACCOUNT_STATUSES, Built, CAMPAIGN_SOURCES, CITY_POOL, EMAIL_FIELD, FIRST_NAMES, LAST_NAMES, personaToBuilt() (+16 more)

### Community 56 - "backend/package.json"
Cohesion: 0.05
Nodes (37): description, date-fns, date-fns-tz, eslint, ts-node, @types/node, typescript, license (+29 more)

### Community 57 - "AgeStatusService"
Cohesion: 0.13
Nodes (12): AgeStatusController, ApiTags, Body, Controller, Get, Param, Post, AgeStatusService (+4 more)

### Community 58 - "rest-api.connector.ts"
Cohesion: 0.07
Nodes (27): ConnectorFactory, DataSourceRowForConnector, Injectable, Connector, ConnectorsModule, Module, defaultSleep(), ReadOnlyHttpClient (+19 more)

### Community 59 - "demo-company-server"
Cohesion: 0.18
Nodes (10): Access log, demo-company-server, Demo dataset (`npm run seed`), Endpoints — copy-paste table, Field names (deliberately messy — do not "fix" them), Personas, Running, Schema (+2 more)

### Community 60 - "ReplaceMappingsDto"
Cohesion: 0.07
Nodes (32): AttachPurposesDto, ApiProperty, ArrayUnique, IsArray, IsString, ReplaceMappingsDto, SourceFieldMappingDto, ApiProperty (+24 more)

### Community 61 - ".markRead"
Cohesion: 0.23
Nodes (9): NotificationsController, ApiOkResponse, ApiTags, Controller, Get, HttpCode, Param, Post (+1 more)

### Community 62 - "4. REQUIREMENTS"
Cohesion: 0.22
Nodes (9): 4.1 Tenancy, auth and permissions (SE-02, GO-04), 4.2 Connector layer, 4.3 Purposes and lawful basis (LB-01, LB-02, CN-02), 4.4 Normalization and identity resolution (GO-03), 4.5 API surface (MVP 1), 4.6 Frontend pages (MVP 1), 4.7 Audit requirements, 4.8 The demo company server (+1 more)

### Community 63 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom (+13 more)

### Community 64 - "DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING"
Cohesion: 0.29
Nodes (6): 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 1 GOAL (definition of done), DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING, Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every feature here exists to satisfy a checklist ID., Self-contained build document. Paste this entire file as your vibe-coding prompt.

### Community 65 - "EmployeesPage.tsx"
Cohesion: 0.07
Nodes (33): PermissionGateProps, ExportButtons(), handleExport(), saveBlob(), GAP_RESOLUTION_LINK, GapsPanel(), GapsPanelProps, RecentAuditStrip() (+25 more)

### Community 66 - "test-database.ts"
Cohesion: 0.08
Nodes (26): ApiServiceUnavailableResponse, HealthController, ApiOkResponse, ApiTags, Controller, Get, HttpCode, HealthModule (+18 more)

### Community 67 - "1. IDEA CONTEXT (read this first)"
Cohesion: 0.50
Nodes (4): 1. IDEA CONTEXT (read this first), Non-negotiable project rules (apply to BOTH MVPs), The DPDP concepts you need, in plain language, What MVP 1 delivers when done

### Community 68 - "MVP1 Evaluation Against Spec Section 6"
Cohesion: 0.07
Nodes (29): Check 10: Conflicts are surfaced, not silently resolved (GO-03), Check 11: Purpose and lawful basis are never inferred (LB-02), Check 12: The registers actually answer s.11(1)(b) (RT-04), Check 13: A processor cannot go live without a contract (GO-02), Check 14: Credentials are encrypted and never leave the backend, Check 15: The access log records who looked at whom (SE-03, SE-05), Check 16: The audit log cannot be edited, Check 17: Sequence has no gaps (+21 more)

### Community 69 - "BreachWizardPage.tsx"
Cohesion: 0.10
Nodes (24): BreachObligationCard(), countdown(), Obligation, DataCategory, Breach, BreachDetailPage(), downloadBoardReport(), buildExtensionPayload() (+16 more)

### Community 70 - "UpdateRolePermissionsDto"
Cohesion: 0.12
Nodes (14): ApiProperty, ArrayUnique, IsArray, IsString, UpdateRolePermissionsDto, RolesController, ApiTags, Body (+6 more)

### Community 71 - "EmployeeAuthController"
Cohesion: 0.18
Nodes (13): EmployeeLoginDto, ApiProperty, IsEmail, IsString, MinLength, EmployeeAuthController, ApiTags, Body (+5 more)

### Community 72 - "audit-read.service.ts"
Cohesion: 0.11
Nodes (19): AUDIT_ACTIONS, ACCESS_LOG_CSV_HEADER, ACCESS_LOG_ENTRY_SELECT, AccessLogEntryRow, AUDIT_EVENT_LIST_SELECT, AuditEventListItem, AuditEventListResult, AuditEventListRow (+11 more)

### Community 73 - "normalization.service.ts"
Cohesion: 0.10
Nodes (21): asPayload(), copyJson(), NormalizationService, NormalizationSourceRecord, NormalizedRecordInput, nullableString(), RawPayload, rawString() (+13 more)

### Community 75 - "ScopedTransactionClient"
Cohesion: 0.03
Nodes (86): ScopedTransactionClient, allocateCounterValue(), AUDIT_COUNTER_NAME, ReferenceService, Injectable, INFORMATION_REQUEST_PUBLIC_SELECT, PublicInformationRequest, RULE_23_NON_DISCLOSURE_CITATION (+78 more)

### Community 76 - "@tanstack/react-query"
Cohesion: 0.02
Nodes (152): AppShell(), NAV_ITEMS, OrganizationSummary, NotificationBell(), NotificationBellProps, EMPTY, loginAs(), jsonResponse() (+144 more)

### Community 77 - "CreateRecipientDto"
Cohesion: 0.06
Nodes (31): CreateRecipientDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional (+23 more)

### Community 78 - "TokenService"
Cohesion: 0.07
Nodes (13): TenantMiddleware, Injectable, EmployeeAuthService, Injectable, Get, UseGuards, PrincipalAuthService, Injectable (+5 more)

### Community 79 - "CreateRetentionPolicyDto"
Cohesion: 0.06
Nodes (31): CreateRetentionPolicyDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn, IsInt, IsOptional, IsString (+23 more)

### Community 80 - "security-measures.service.ts"
Cohesion: 0.06
Nodes (33): CreateSecurityMeasureDto, SECURITY_MEASURE_TYPES, SECURITY_RULE_REFERENCES, ApiProperty, ApiPropertyOptional, IsBoolean, IsDateString, IsIn (+25 more)

### Community 81 - "DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS"
Cohesion: 0.17
Nodes (11): 1. IDEA CONTEXT (read this first), 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 2 GOAL (definition of done), DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS, Non-negotiable rules (carried from MVP 1, still binding), Notice · Consent · Children · Rights · Retention · Breach · Evidence, One new rule, specific to MVP 2 (+3 more)

### Community 82 - "dataset.test.ts"
Cohesion: 0.12
Nodes (18): seedDatabase(), selfCheck(), toSimRecords(), last6(), nameKey(), normalizeEmail(), normalizePhone(), SimCandidate (+10 more)

### Community 83 - "generateDataset"
Cohesion: 0.18
Nodes (11): formatDob(), generateDataset(), adultDob(), buildLinkedPair(), childDob(), fillSystemRecord(), nextEmail(), nextPhoneDigits() (+3 more)

### Community 84 - "candidates.controller.ts"
Cohesion: 0.12
Nodes (14): CandidatesController, ApiTags, Controller, Get, Param, Post, Query, CandidatesService (+6 more)

### Community 85 - "data-sources.service.ts"
Cohesion: 0.09
Nodes (22): TenantScopedPrismaClient, CONNECTOR_SOURCE_SELECT, DATA_SOURCE_FIELD_SELECT, DATA_SOURCE_PUBLIC_SELECT, PublicDataSource, PublicDataSourceField, TestConnectionResult, computeMappingWarnings() (+14 more)

### Community 86 - "AuditChainService"
Cohesion: 0.14
Nodes (10): AuditChainService, serviceWith(), Injectable, AuditEventsEvidenceController, ApiTags, Controller, Get, Res (+2 more)

### Community 87 - ".record"
Cohesion: 0.12
Nodes (16): assertNoForbiddenMetadata(), diffRules(), serializeDiffValue(), toPublicComplianceRule(), worstCaseDeadlineDays(), CreateComplianceRuleDto, ApiProperty, ApiPropertyOptional (+8 more)

### Community 88 - "PrincipalAuthController"
Cohesion: 0.18
Nodes (13): PrincipalLoginDto, ApiProperty, IsEmail, IsString, MinLength, PrincipalAuthController, ApiTags, Body (+5 more)

### Community 89 - "CandidateComparison.tsx"
Cohesion: 0.16
Nodes (15): AGREEMENT_LABEL, CandidateComparison(), CandidateComparisonProps, CandidateSignal, FIELD_LABELS, MatchCandidateListItem, SignalAgreement, signalBadgeVariant() (+7 more)

### Community 90 - "seed-scale.ts"
Cohesion: 0.18
Nodes (18): getOrCreateOrganization(), insertBatches(), main(), PERFORMANCE_PERMISSION_CODES, SCALE_APPROVER_EMAIL, SCALE_CONSENT_COUNT, SCALE_EMPLOYEE_PASSWORD, SCALE_OPERATOR_EMAIL (+10 more)

### Community 91 - "cn"
Cohesion: 0.03
Nodes (89): ConfirmDialogProps, NotificationRow(), Skeleton(), SourceChip(), SourceChipProps, UnreviewedRuleChip(), UnreviewedRuleChipProps, Dialog (+81 more)

### Community 92 - "UpdateAlgorithmEntryDto"
Cohesion: 0.17
Nodes (11): ApiPropertyOptional, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString (+3 more)

### Community 93 - "@nestjs/config"
Cohesion: 0.19
Nodes (9): CryptoModule, Module, CryptoService, InvalidEncryptionKeyError, MalformedCiphertextError, makeService(), VALID_KEY_B64, Injectable (+1 more)

### Community 94 - "CreateMeRequestDto"
Cohesion: 0.18
Nodes (10): CreateMeRequestDto, PRINCIPAL_REQUEST_TYPES, PrincipalRequestType, ApiProperty, ApiPropertyOptional, IsIn, IsObject, IsOptional (+2 more)

### Community 95 - "DPDP Platform MVP 2 — Compliance Operations — Implementation Plan"
Cohesion: 0.17
Nodes (11): Context, DPDP Platform MVP 2 — Compliance Operations — Implementation Plan, Finishing, Global Constraints, Interface publication, MVP 1 left the door open deliberately — use these, do not rebuild them, Pre-flight conflict scan (orchestrator, before Task 1), Rulings taken up front (+3 more)

### Community 96 - "2. ARCHITECTURE"
Cohesion: 0.33
Nodes (6): 2.1 New packages (everything from MVP 1 stays), 2.2 New Prisma models (all MVP 1 models unchanged), 2.3 Raw SQL follow-up migration, 2.4 Seeded compliance rules — defaults for a DPO to review, not legal advice, 2.5 Background jobs (added to the MVP 1 BullMQ setup), 2. ARCHITECTURE

### Community 97 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, baseUrl, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+15 more)

### Community 98 - "MessagingCampaignBuilderPage.tsx"
Cohesion: 0.10
Nodes (30): AGE_STATUSES, AudienceBuilder(), replaceRules(), AudienceField, AudienceFilter, AudiencePreview, AudienceRule, audienceRuleForField() (+22 more)

### Community 99 - "main.ts"
Cohesion: 0.17
Nodes (6): IS_PUBLIC_KEY, JwtEmployeeGuard, Injectable, BigInt, @nestjs/core, nestjs-pino

### Community 100 - "PrincipalEvidenceController"
Cohesion: 0.27
Nodes (6): PrincipalEvidenceController, ApiTags, Controller, Get, Param, Res

### Community 101 - "MaskingService"
Cohesion: 0.24
Nodes (4): MaskingService, Injectable, AuditReadService, Injectable

### Community 102 - "UpdateMeNominationDto"
Cohesion: 0.18
Nodes (10): NOMINATION_ACTIVATION, NOMINATION_SCOPES, ApiProperty, ApiPropertyOptional, IsEmail, IsIn, IsOptional, IsString (+2 more)

### Community 103 - "Public"
Cohesion: 0.14
Nodes (18): ApiExtraModels, CurrentPrincipal, Public(), JwtPrincipalGuard, PrincipalActor, Injectable, MePrivacyContactDto, ApiProperty (+10 more)

### Community 104 - "DPDP Privacy Platform — Client Evaluation"
Cohesion: 0.25
Nodes (7): 1. What this computer needs, 2. Download and unzip, 3. Open the client guide and follow it, DPDP Privacy Platform — Client Evaluation, Sign-in details, The eight controls, The two shareable guides

### Community 105 - "@nestjs/common"
Cohesion: 0.07
Nodes (34): BREACH_PUBLIC_SELECT, BREACH_RULES, TRANSITIONS, CurrentNotificationActor, MarkAllReadResponseDto, NotificationDto, NotificationListResponseDto, ApiProperty (+26 more)

### Community 106 - "UpdateComplianceRuleDto"
Cohesion: 0.09
Nodes (18): ComplianceController, ApiTags, Body, Controller, Get, Param, Patch, Post (+10 more)

### Community 107 - "guardians.controller.ts"
Cohesion: 0.06
Nodes (33): CurrentActorPermissions, APPOINTING_AUTHORITIES, AppointingAuthority, CreateGuardianDto, ApiProperty, ApiPropertyOptional, IsEmail, IsEnum (+25 more)

### Community 108 - "DeadlineScanProcessor"
Cohesion: 0.40
Nodes (3): DeadlineScanProcessor, Processor, DeadlineScanJobData

### Community 109 - "access-report-render.ts"
Cohesion: 0.36
Nodes (12): renderBoardDetailedPdf(), renderBoardInitialPdf(), BoardBreachReport, ACCESS_REPORT_CSV_HEADER, renderAccessReportPdf(), renderPdf(), writePdfLetterhead(), writePdfLine() (+4 more)

### Community 110 - "data-sources-api.ts"
Cohesion: 0.04
Nodes (70): DataTable(), clickAction, columns, Row, errorLogEntries(), STATUS_VARIANT, SyncHistoryTable(), SyncHistoryTableProps (+62 more)

### Community 111 - "token.service.ts"
Cohesion: 0.06
Nodes (36): getDummyHash(), EmployeeLoginResult, EmployeeRefreshResult, LoginRequestMeta, PRINCIPAL_ACCOUNT_PUBLIC_SELECT, PrincipalLoginResult, PrincipalRefreshResult, PublicPrincipalAccount (+28 more)

### Community 112 - "csvDocument"
Cohesion: 0.25
Nodes (5): renderAccessReportCsv(), EvidencePackService, Injectable, csvDocument(), sortedUnique()

### Community 113 - "children/types.ts"
Cohesion: 0.27
Nodes (10): GuardianConsentSelector(), GuardianConsentSelectorProps, GuardianKind, GuardianRelationship, GuardianVerification, guardianVerificationLabel(), isGuardianConsentEligible(), VERIFICATION_METHODS (+2 more)

### Community 115 - "notifications.module.ts"
Cohesion: 0.10
Nodes (21): MailModule, Module, MailerService, MailMessage, Injectable, MailConfig, selectEmailProvider(), NotificationAudience (+13 more)

### Community 116 - "CreateAlgorithmEntryDto"
Cohesion: 0.06
Nodes (30): CompleteSdfAssessmentDto, ApiPropertyOptional, IsBoolean, IsDateString, IsOptional, IsString, CreateAlgorithmEntryDto, ApiProperty (+22 more)

### Community 117 - "audit-read.controller.ts"
Cohesion: 0.11
Nodes (13): PERMISSION_KEY, PermissionsGuard, PermissionsRequest, Injectable, AuditReadController, ApiTags, Controller, Get (+5 more)

### Community 118 - "supertest"
Cohesion: 0.05
Nodes (31): seedGrievanceStatutoryBaseline(), findActiveNonDisclosureDirections(), isUnderActiveNonDisclosure(), EMAIL_PROVIDER, fixture(), fixtureWithBoardInitial(), addEmployeeToOrg(), setupOrg() (+23 more)

### Community 119 - ".unmerge"
Cohesion: 0.17
Nodes (10): ApiProperty, IsString, MinLength, UnmergeDto, ApiTags, Body, Controller, Param (+2 more)

### Community 120 - "routes.test.ts"
Cohesion: 0.22
Nodes (8): closeDb(), { buildServer }, EXPECTED_FIELDS, KEYS, { openDb, closeDb }, ROUTES, TEST_DB_PATH, better-sqlite3

### Community 121 - "AddNoteDto"
Cohesion: 0.14
Nodes (13): AddNoteDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsOptional, IsString, MinLength, FlagFrivolousDto (+5 more)

### Community 122 - "Waves and Tasks"
Cohesion: 0.25
Nodes (8): Task 16 — Promoted UI primitives, compliance chips, countdowns and notification polling, Task 1 — Schema, migrations, triggers, tenancy registration, audit actions, packages, test harness, Task 25 — MVP 2 demo seed and the performance dataset, Task 26 — The full evaluation run, Wave 0 — Foundation (1 task, sequential; nothing else can start), Wave 5 — Frontend shared layer (1 task, sequential; every later page depends on it), Wave 8 — Demo data, scale and acceptance (2 tasks, sequential), Waves and Tasks

### Community 123 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, class-variance-authority, clsx, date-fns, date-fns-tz, @hookform/resolvers, lucide-react, papaparse (+15 more)

### Community 124 - "ListSyncJobsQueryDto"
Cohesion: 0.29
Nodes (7): ListSyncJobsQueryDto, IsInt, IsOptional, IsString, Max, Min, Type

### Community 125 - "DataSourcesService"
Cohesion: 0.32
Nodes (4): DataSourcesService, duplicateNameMessage(), isUniqueConstraintViolation(), Injectable

### Community 126 - "MeRightsService"
Cohesion: 0.10
Nodes (14): AddMeRequestCommentDto, ApiProperty, IsString, MinLength, MeRightsController, Body, Controller, Param (+6 more)

### Community 127 - "seed.ts"
Cohesion: 0.09
Nodes (33): DEMO_EMPLOYEES, DEMO_ORG, DEMO_PASSWORD, DemoEmployeeSeed, main(), seedMessageTemplates(), contentHash(), DEMO_GUARDIAN_NAME (+25 more)

### Community 128 - "sync-lock.service.ts"
Cohesion: 0.13
Nodes (11): toRedisConnectionOptions(), lockKey(), SYNC_LOCK_HEARTBEAT_INTERVAL_MS, SYNC_LOCK_PREFIX, SYNC_LOCK_TTL_MS, SyncLockHandle, SyncLockService, Injectable (+3 more)

### Community 129 - "PDFDocument"
Cohesion: 0.13
Nodes (4): PDFDocument, PDFDocumentOptions, pdfkit, PDFTextOptions

### Community 130 - "DateTime.tsx"
Cohesion: 0.13
Nodes (20): DateTime(), DateTimeProps, OrgTimezoneContext, OrgTimezoneProvider, useOrgTimezone(), Tooltip, TooltipContent, TooltipProvider (+12 more)

### Community 131 - "canonicalJson"
Cohesion: 0.29
Nodes (7): canonicalJson(), Custom, stringify(), typeLabel(), ChainVerificationResult, Event, verifyChainIntact()

### Community 132 - "compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include

### Community 133 - "inventory.service.ts"
Cohesion: 0.50
Nodes (4): InventoryGap, InventorySummary, RecentAuditEvent, ShortfallCounts

### Community 134 - "CreateTransferDto"
Cohesion: 0.06
Nodes (29): CreateTransferDto, ApiProperty, ApiPropertyOptional, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional (+21 more)

### Community 135 - "Wave 1 — Engines (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I1, Task 2 — ComplianceService, rule versioning and the compliance-rules API, Task 3 — Template storage, whitelisted Handlebars rendering, and the fifteen system templates, Task 4 — The audience compiler and preview endpoint, Task 5 — Mail transport, notification providers and the notifications API, Wave 1 — Engines (4 parallel + integrator)

### Community 136 - "InventoryService"
Cohesion: 0.19
Nodes (7): InventoryController, ApiTags, Controller, Get, Res, InventoryService, Injectable

### Community 137 - "SyncService"
Cohesion: 0.13
Nodes (11): SyncController, SyncJobsController, ApiTags, Controller, Get, HttpCode, Param, Post (+3 more)

### Community 138 - "CreateCampaignDto"
Cohesion: 0.20
Nodes (10): CreateCampaignDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsEnum, IsObject, IsOptional (+2 more)

### Community 139 - "capture-guide-screenshots.mjs"
Cohesion: 0.24
Nodes (10): applyStep(), main(), only, OUT, ROOT, shoot(), SHOTS, signIn() (+2 more)

### Community 140 - "SdfController"
Cohesion: 0.14
Nodes (8): AlgorithmRegisterService, Injectable, SdfController, ApiTags, Controller, Get, SdfGapsService, Injectable

### Community 141 - "Wave 2 — Domain services, part one (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I2, Task 6 — The rights request engine and `deadline-scan`, Task 7 — The notice builder, Task 8 — Children, guardians and exemption claims, Task 9 — Retention core, the floor, legal holds and the retention jobs, Wave 2 — Domain services, part one (4 parallel + integrator)

### Community 142 - "RequestsService"
Cohesion: 0.34
Nodes (3): RequestsService, transitionTargets(), Injectable

### Community 143 - "Wave 3 — Domain services, part two (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I3, Task 10 — Consent records, events, backfill and one-click withdrawal, Task 11 — Campaigns, the eight send guards, and delivery, Task 12 — Access report, per-principal evidence, chain verification and the evidence pack, Task 13 — SDF pack, Board and Government interaction, Wave 3 — Domain services, part two (4 parallel + integrator)

### Community 144 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, preview, test, test:watch, typecheck

### Community 145 - "dedupe-vault-names.py"
Cohesion: 0.29
Nodes (11): main(), Path, Make the generated Obsidian vault safe to check out and unzip on Windows.…, The name that keeps its spelling: the first in sorted order. Sorting is what…, A free name for the loser, marked by its own casing., Trim any note whose name would blow the Windows path limit. The trimmed name…, Repoint every [[wikilink]] that named a renamed note., relink() (+3 more)

### Community 146 - "breach.types.ts"
Cohesion: 0.50
Nodes (3): AffectedPreview, PublicBreachAffectedPrincipal, PublicBreachObligation

### Community 147 - "frontend/package.json"
Cohesion: 0.07
Nodes (26): description, date-fns, date-fns-tz, eslint, typescript, license, name, private (+18 more)

### Community 148 - "CreateBreachDto"
Cohesion: 0.22
Nodes (9): CreateBreachDto, ApiProperty, ApiPropertyOptional, IsArray, IsDateString, IsEnum, IsOptional, IsString (+1 more)

### Community 149 - "UpdateDataSourceDto"
Cohesion: 0.22
Nodes (9): ApiPropertyOptional, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength (+1 more)

### Community 150 - "Wave 6 — Frontend, part one (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I5, Task 17 — `/app/requests`, `/app/requests/:ref`, `/app/settings/rights`, Task 18 — `/app/notices`, `/app/consents`, `/app/settings/compliance`, Task 19 — `/app/children`, `/app/retention`, Task 20 — The Data Principal portal, Wave 6 — Frontend, part one (4 parallel + integrator)

### Community 151 - "Wave 7 — Frontend, part two (4 parallel + integrator)"
Cohesion: 0.33
Nodes (6): Integrator I6, Task 21 — `/app/messaging/templates`, `/app/messaging/campaigns`, the audience builder UI, Task 22 — `/app/breaches` and the creation wizard, Task 23 — `/app/sdf` and `/app/information-requests`, Task 24 — `/app/principals/:id/evidence`, audit UI and dashboard tiles, Wave 7 — Frontend, part two (4 parallel + integrator)

### Community 155 - "csv-writer.ts"
Cohesion: 0.33
Nodes (6): withCsvLetterhead(), csvField(), csvRow(), needsQuoting(), RFC-4180, RFC-4180

### Community 157 - "CreatePurposeDto"
Cohesion: 0.06
Nodes (27): CreatePurposeDto, ApiProperty, ApiPropertyOptional, IsArray, IsEnum, IsOptional, IsString, MinLength (+19 more)

### Community 158 - "build-standalone.py"
Cohesion: 0.38
Nodes (6): build(), embed_image(), main(), Path, Build shareable, single-file copies of both HTML runbooks., Match

### Community 159 - "Step 6 current-head live rerun — network results (FAILED acceptance)"
Cohesion: 0.33
Nodes (5): Diagnosis and stop condition, Post-sync browser observations, Screenshots, Serial source runs, Step 6 current-head live rerun — network results (FAILED acceptance)

### Community 165 - "eslint.config.js"
Cohesion: 0.33
Nodes (5): @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, typescript-eslint

### Community 167 - "Wave 4 — Breach and the remaining jobs (2 parallel + integrator)"
Cohesion: 0.50
Nodes (4): Integrator I4, Task 14 — The breach module, Task 15 — The remaining scheduled jobs and the scheduler consolidation, Wave 4 — Breach and the remaining jobs (2 parallel + integrator)

### Community 168 - "principals.controller.ts"
Cohesion: 0.14
Nodes (14): ListPrincipalsDto, IsEnum, IsInt, IsOptional, IsString, Max, Min, Transform (+6 more)

### Community 169 - "mapping-warning-response.dto.ts"
Cohesion: 0.36
Nodes (7): MappingWarningPurposeSummaryResponseDto, MappingWarningResponseDto, ApiProperty, MappingsResponseDto, SourceFieldMappingResponseDto, ApiProperty, MappingWarningType

### Community 170 - "createApiClient"
Cohesion: 0.48
Nodes (7): createApiClient(), buildInit(), onAuthExpired(), rawRequest(), refresh(), requestJson(), extractMessage()

### Community 175 - "CreateDataSourceDto"
Cohesion: 0.20
Nodes (10): CreateDataSourceDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsEnum, IsInt, IsOptional, IsString (+2 more)

### Community 176 - "ListRequestsDto"
Cohesion: 0.25
Nodes (7): ListRequestsDto, IsBoolean, IsEnum, IsOptional, IsString, Transform, Query

### Community 179 - "UpdateBreachDto"
Cohesion: 0.15
Nodes (12): ExtensionDto, ApiProperty, IsDateString, IsString, MinLength, ApiPropertyOptional, IsDateString, IsEnum (+4 more)

### Community 180 - "app.module.ts"
Cohesion: 0.06
Nodes (64): AuditModule, Module, MaskingModule, Module, ReferenceModule, Module, TenantModule, Module (+56 more)

### Community 182 - "PrismaModule"
Cohesion: 0.67
Nodes (3): PrismaModule, Module, Global

### Community 185 - "CompleteObligationDto"
Cohesion: 0.33
Nodes (6): CompleteObligationDto, ApiPropertyOptional, IsIn, IsOptional, IsString, MinLength

### Community 187 - "PermissionsController"
Cohesion: 0.33
Nodes (4): PermissionsController, ApiTags, Controller, Get

### Community 188 - "AssignRequestDto"
Cohesion: 0.29
Nodes (6): AssignRequestDto, ApiProperty, ApiPropertyOptional, IsOptional, IsString, MinLength

### Community 191 - "sync.e2e-spec.ts"
Cohesion: 0.03
Nodes (60): PERMISSIONS, PermissionSeed, AppModule, Module, jsonHandler(), MockHttpServer, createManager(), createOrgWithRole() (+52 more)

### Community 192 - "VerifyIdentityDto"
Cohesion: 0.29
Nodes (6): ApiProperty, ApiPropertyOptional, IsOptional, IsString, MinLength, VerifyIdentityDto

### Community 193 - "MVP2 Evaluation Against Spec Sections 6 and 7"
Cohesion: 0.17
Nodes (11): Concurrent Check 33 access-log evidence, Defects found and fixed during this evaluation, Executive result, Known gaps and follow-up, Live sync setup diagnosis, MVP2 Evaluation Against Spec Sections 6 and 7, Runtime pre-flight, Section 6 evidence totals (+3 more)

### Community 200 - "EvidencePackController"
Cohesion: 0.29
Nodes (5): EvidencePackController, ApiTags, Controller, Get, Res

### Community 201 - "TemplatesService"
Cohesion: 0.06
Nodes (32): CreateTemplateDto, ApiProperty, ApiPropertyOptional, ArrayUnique, IsArray, IsEnum, IsOptional, IsString (+24 more)

### Community 202 - "PreviewAudienceDto"
Cohesion: 0.20
Nodes (9): Body, Post, PreviewAudienceDto, ApiProperty, ApiPropertyOptional, IsObject, IsOptional, IsString (+1 more)

### Community 204 - "zip-writer.ts"
Cohesion: 0.47
Nodes (5): buildZip(), crc32(), CRC_TABLE, toDosDateTime(), ZipEntryInput

### Community 205 - "EscalateRequestDto"
Cohesion: 0.40
Nodes (4): EscalateRequestDto, ApiPropertyOptional, IsOptional, IsString

### Community 207 - "BreachesController"
Cohesion: 0.12
Nodes (18): Actor, parseIds(), BreachesController, ApiTags, Body, Controller, Get, Param (+10 more)

### Community 208 - "SyncQueueService"
Cohesion: 0.09
Nodes (17): BootRegistration, BootRegistrationRegistry, Injectable, RECONCILE_BOOT_TIMEOUT_MS, withBootTimeout(), InjectQueue, InjectQueue, Mvp2ScheduleReconciliationService (+9 more)

### Community 213 - "RequestsController"
Cohesion: 0.26
Nodes (6): RequestsController, ApiTags, Controller, Get, Param, Res

### Community 216 - "tenant-context.js"
Cohesion: 0.33
Nodes (4): isThenable(), storage, node_async_hooks_1, run()

### Community 230 - "Grievance statutory-baseline fix report"
Cohesion: 0.50
Nodes (3): Grievance statutory-baseline fix report, Implemented, Verification

### Community 235 - "LanguageSelector.tsx"
Cohesion: 0.40
Nodes (3): LanguageSelectorProps, NOTICE_LANGUAGES, NoticeLanguageCode

### Community 239 - "principals.service.ts"
Cohesion: 0.08
Nodes (25): CAN_VIEW_ALL_PERSONAL_DATA, PASS_THROUGH_FIELDS, DATA_CATEGORY_ORDER, MeDataCategoryGroup, MeDataValue, PURPOSE_NOT_CONFIGURED, MAX_PRINCIPALS_PAGE, PRINCIPALS_PAGE_SIZE (+17 more)

### Community 250 - "SdfCycleScanService"
Cohesion: 0.26
Nodes (5): SdfCycleScanService, Injectable, SdfCycleScanProcessor, Processor, SdfCycleScanJobData

### Community 253 - "@nestjs/swagger"
Cohesion: 0.05
Nodes (19): REQUESTING_BODIES, RequestingBody, COMMITMENT_STATUSES, SCHEDULE_PARTS, DataSourcePurposeResponseDto, DataSourcePurposesResponseDto, ApiProperty, ApiPropertyOptional (+11 more)

## Knowledge Gaps
- **1199 isolated node(s):** `name`, `version`, `private`, `description`, `main` (+1194 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2320 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `@nestjs/common` to `sync-lock.service.ts`, `canonicalJson`, `inventory.service.ts`, `@prisma/client`, `AuditService`, `tenant.extension.ts`, `RequirePermission`, `campaigns.service.ts`, `employees.controller.ts`, `retention/retention.controller.ts`, `queues.module.ts`, `compile-audience.ts`, `principals.controller.ts`, `app.module.ts`, `notices.service.ts`, `PrismaService`, `backend/package.json`, `rest-api.connector.ts`, `sync.e2e-spec.ts`, `test-database.ts`, `audit-read.service.ts`, `normalization.service.ts`, `ScopedTransactionClient`, `security-measures.service.ts`, `SyncQueueService`, `candidates.controller.ts`, `data-sources.service.ts`, `seed-scale.ts`, `@nestjs/config`, `main.ts`, `Public`, `guardians.controller.ts`, `access-report-render.ts`, `principals.service.ts`, `token.service.ts`, `notifications.module.ts`, `audit-read.controller.ts`, `supertest`, `SdfCycleScanService`, `@nestjs/swagger`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `RequirePermission()` connect `RequirePermission` to `canonicalJson`, `CreateTransferDto`, `InventoryService`, `SyncService`, `UpdateOrganizationDto`, `SdfController`, `CreateExemptionClaimDto`, `CreateVoluntaryUndertakingDto`, `employees.controller.ts`, `CreateInformationRequestDto`, `CreatePurposeDto`, `retention/retention.controller.ts`, `principals.controller.ts`, `CreateSharingActivityDto`, `ConsentsService`, `ListRequestsDto`, `DataSourcesController`, `AgeStatusService`, `PermissionsController`, `ReplaceMappingsDto`, `AssignRequestDto`, `VerifyIdentityDto`, `UpdateRolePermissionsDto`, `EvidencePackController`, `TemplatesService`, `PreviewAudienceDto`, `CreateRecipientDto`, `EscalateRequestDto`, `BreachesController`, `CreateRetentionPolicyDto`, `security-measures.service.ts`, `candidates.controller.ts`, `RequestsController`, `AuditChainService`, `UpdateAlgorithmEntryDto`, `PrincipalEvidenceController`, `UpdateComplianceRuleDto`, `guardians.controller.ts`, `access-report-render.ts`, `.remove`, `CreateAlgorithmEntryDto`, `audit-read.controller.ts`, `.unmerge`, `AddNoteDto`, `@nestjs/swagger`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `@prisma/client` connect `@prisma/client` to `AuditService`, `tenant.extension.ts`, `.me`, `breach.types.ts`, `campaigns.service.ts`, `retention/retention.controller.ts`, `queues.module.ts`, `compile-audience.ts`, `mapping-warning-response.dto.ts`, `notices.service.ts`, `PrismaService`, `backend/package.json`, `rest-api.connector.ts`, `sync.e2e-spec.ts`, `test-database.ts`, `audit-read.service.ts`, `normalization.service.ts`, `ScopedTransactionClient`, `security-measures.service.ts`, `candidates.controller.ts`, `data-sources.service.ts`, `@nestjs/common`, `guardians.controller.ts`, `principals.service.ts`, `token.service.ts`, `notifications.module.ts`, `supertest`, `@nestjs/swagger`, `seed.ts`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _1199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Consent & Breach Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `DPDP Compliance Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._