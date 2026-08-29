# Graph Report - DPDP app  (2026-08-29)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 149 nodes · 146 edges · 8 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 69,247 input · 1,071 output

## Community Hubs (Navigation)
- Consent & Breach Checklist
- DPDP Compliance Checklist
- Access Control & Audit Checks
- MVP2 Compliance Operations
- Compliance Requirements Spec
- MVP1 Foundation & Discovery
- System Architecture Setup
- MVP1 Requirements Spec

## God Nodes (most connected - your core abstractions)
1. `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` - 37 edges
2. `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` - 25 edges
3. `DPDP COMPLIANCE CHECKLIST` - 22 edges
4. `4. REQUIREMENTS` - 15 edges
5. `DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS` - 11 edges
6. `DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING` - 10 edges
7. `2. ARCHITECTURE` - 9 edges
8. `4. REQUIREMENTS` - 9 edges
9. `2. ARCHITECTURE` - 6 edges
10. `1. IDEA CONTEXT (read this first)` - 4 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (8 total, 0 thin omitted)

### Community 0 - "Consent & Breach Checklist"
Cohesion: 0.05
Nodes (37): 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step), Check 10: Consent evidence is complete and frozen (CN-09), Check 11: Legitimate-use purposes never show a consent toggle (LB-06), Check 12: A child cannot be marketed to (CH-05) — the flagship prohibition, Check 13: A child's consent requires a verified guardian (CH-01…CH-03), Check 14: Preview count equals send count, exactly, Check 15: Compliance messages are not consent-filtered, Check 16: Sending is idempotent (+29 more)

### Community 1 - "DPDP Compliance Checklist"
Cohesion: 0.08
Nodes (24): 0. HOW TO USE THIS DOCUMENT, 10. RETENTION AND ERASURE (Section 8(7)–(8), Rule 8, Third Schedule), 11. DATA PRINCIPAL RIGHTS (Sections 11–14, Rule 14), 12. PROCESSORS, SHARING AND CROSS-BORDER, 13. SIGNIFICANT DATA FIDUCIARY (Section 10, Rule 13), 14. BOARD AND GOVERNMENT INTERACTION, 15. PENALTIES (Section 33 and the Schedule), 16. THE EVIDENCE PACK — what a company must be able to produce on demand (+16 more)

### Community 2 - "Access Control & Audit Checks"
Cohesion: 0.08
Nodes (25): 6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step), Check 10: Conflicts are surfaced, not silently resolved (GO-03), Check 11: Purpose and lawful basis are never inferred (LB-02), Check 12: The registers actually answer s.11(1)(b) (RT-04), Check 13: A processor cannot go live without a contract (GO-02), Check 14: Credentials are encrypted and never leave the backend, Check 15: The access log records who looked at whom (SE-03, SE-05), Check 16: The audit log cannot be edited (+17 more)

### Community 3 - "MVP2 Compliance Operations"
Cohesion: 0.11
Nodes (17): 1. IDEA CONTEXT (read this first), 2.1 New packages (everything from MVP 1 stays), 2.2 New Prisma models (all MVP 1 models unchanged), 2.3 Raw SQL follow-up migration, 2.4 Seeded compliance rules — defaults for a DPO to review, not legal advice, 2.5 Background jobs (added to the MVP 1 BullMQ setup), 2. ARCHITECTURE, 3. GOALS (+9 more)

### Community 4 - "Compliance Requirements Spec"
Cohesion: 0.13
Nodes (15): 4.10 Breach (BR-01…BR-15), 4.11 SDF pack (SD-01…SD-07), 4.12 Board and Government interaction (BD-01…BD-06), 4.13 New API endpoints, 4.14 Frontend, 4.1 ComplianceService — the engine everything calls, 4.2 Notice builder (NT-01…NT-10), 4.3 Consent (CN-01…CN-11) (+7 more)

### Community 5 - "MVP1 Foundation & Discovery"
Cohesion: 0.18
Nodes (10): 1. IDEA CONTEXT (read this first), 3. GOALS, 5. TASKS (build in this order — do not reorder), 7. MVP 1 GOAL (definition of done), DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING, Non-negotiable project rules (apply to BOTH MVPs), Read `DPDP_COMPLIANCE_CHECKLIST.md` alongside this. Every feature here exists to satisfy a checklist ID., Self-contained build document. Paste this entire file as your vibe-coding prompt. (+2 more)

### Community 6 - "System Architecture Setup"
Cohesion: 0.22
Nodes (9): 2.1 Tech stack (locked — do not substitute), 2.2 Machine setup — Linux Mint Cinnamon (run these exactly), 2.3 Ports (locked), 2.4 Folder structure, 2.5 Database schema — Prisma (source of truth), 2.6 Raw SQL Prisma cannot express (second migration), 2.7 docker-compose.yml and .env, 2.8 The sync pipeline (+1 more)

### Community 7 - "MVP1 Requirements Spec"
Cohesion: 0.22
Nodes (9): 4.1 Tenancy, auth and permissions (SE-02, GO-04), 4.2 Connector layer, 4.3 Purposes and lawful basis (LB-01, LB-02, CN-02), 4.4 Normalization and identity resolution (GO-03), 4.5 API surface (MVP 1), 4.6 Frontend pages (MVP 1), 4.7 Audit requirements, 4.8 The demo company server (+1 more)

## Knowledge Gaps
- **134 isolated node(s):** `Check 10: Consent evidence is complete and frozen (CN-09)`, `Check 11: Legitimate-use purposes never show a consent toggle (LB-06)`, `Check 12: A child cannot be marketed to (CH-05) — the flagship prohibition`, `Check 13: A child's consent requires a verified guardian (CH-01…CH-03)`, `Check 14: Preview count equals send count, exactly` (+129 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `6. DEVELOPER EVALUATION CHECKLIST (beginner-friendly — do every step)` connect `Consent & Breach Checklist` to `MVP2 Compliance Operations`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `DPDP PLATFORM — MVP 2: COMPLIANCE OPERATIONS` connect `MVP2 Compliance Operations` to `Consent & Breach Checklist`, `Compliance Requirements Spec`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Why does `DPDP PLATFORM — MVP 1: FOUNDATION, DISCOVERY & THE RECORD OF PROCESSING` connect `MVP1 Foundation & Discovery` to `Access Control & Audit Checks`, `System Architecture Setup`, `MVP1 Requirements Spec`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **What connects `Check 10: Consent evidence is complete and frozen (CN-09)`, `Check 11: Legitimate-use purposes never show a consent toggle (LB-06)`, `Check 12: A child cannot be marketed to (CH-05) — the flagship prohibition` to the rest of the system?**
  _134 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Consent & Breach Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `DPDP Compliance Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Access Control & Audit Checks` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._