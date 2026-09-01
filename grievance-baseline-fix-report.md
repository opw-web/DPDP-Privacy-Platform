# Grievance statutory-baseline fix report

Date: 2026-09-01 (Asia/Kolkata)

## Implemented

- Added the hidden, seed-managed `GRIEVANCE_STATUTORY_BASELINE` compliance
  row. Its statutory period and Rule 14(3) citation are held in
  `backend/prisma/seed/compliance-rules.ts`.
- Kept `GRIEVANCE_RESPONSE` as the separately editable/published organization
  rule, seeded as `ORG_POLICY` rather than misrepresenting it as the statute.
- Changed grievance validation to read the enabled baseline and compare every
  deadline unit through the existing worst-case calendar conversion. Missing
  or disabled baseline data rejects the operation (fail closed).
- Excluded the baseline from public list/get output and rejected public
  baseline create, PATCH/versioning, and review operations.
- Added unit and e2e coverage for missing/disabled baseline, public mutation
  refusal, exact-ceiling acceptance, over-ceiling refusal, and all deadline
  units. The e2e fixture loads the TypeScript seed explicitly so stale ignored
  local JavaScript seed artifacts cannot mask the new baseline.

## Verification

- Exact Check 1 grep over `backend/src`: no output.
- `npm run build`: passed before unrelated concurrent breach-work changes were
  introduced into the shared tree.
- `npm test -- --runInBand --testPathPattern=compliance.service.spec.ts`:
  passed, 28/28 tests.
- `node -r ts-node/register` direct seed-module check: confirmed the baseline
  seed helper is exported.

The scoped compliance e2e command was attempted twice but could not compile
the shared `AppModule` because concurrent breach work was incomplete:
`BreachService.dispatchPrincipalNoticeCampaign` was initially absent, then the
in-progress breach query selected a non-existent `MessageCampaign.breach`
relation. No e2e result is claimed here; rerun after that concurrent change is
complete.
