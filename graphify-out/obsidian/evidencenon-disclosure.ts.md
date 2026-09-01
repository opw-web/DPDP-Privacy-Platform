---
source_file: "dpdp-platform/backend/src/modules/evidence/non-disclosure.ts"
type: "code"
community: "access-report.service.ts"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/access-reportservicets
---

# evidence/non-disclosure.ts

## Connections
- [[AuditService]] - `imports` [EXTRACTED]
- [[INFORMATION_REQUEST_PUBLIC_SELECT]] - `contains` [EXTRACTED]
- [[NonDisclosureSplit]] - `contains` [EXTRACTED]
- [[PublicInformationRequest]] - `contains` [EXTRACTED]
- [[ScopedTransactionClient]] - `imports` [EXTRACTED]
- [[access-report.service.ts]] - `imports_from` [EXTRACTED]
- [[audit.service.ts]] - `imports_from` [EXTRACTED]
- [[principal-evidence.service.ts]] - `imports_from` [EXTRACTED]
- [[scoped-transaction-client.ts]] - `imports_from` [EXTRACTED]
- [[splitNonDisclosureRequests()]] - `contains` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/access-reportservicets