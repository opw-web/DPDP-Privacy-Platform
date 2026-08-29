# DPDP COMPLIANCE CHECKLIST
### Every obligation the DPDP Act, 2023 and the DPDP Rules, 2025 place on a business — and which part of the platform serves it.
### This document is the **objective specification**. MVP 1 and MVP 2 exist to satisfy the IDs in this file.

---

## 0. HOW TO USE THIS DOCUMENT

Every obligation below has a stable ID (`NT-03`, `BR-05`, …). The two build documents reference these IDs. When a coding agent asks "why does this feature exist?", the answer is an ID in this file.

Each row carries:

| Column | Meaning |
|---|---|
| **ID** | Stable reference used by the build docs |
| **Obligation** | What the business must actually do, in plain words |
| **Source** | Section of the Act / Rule of the DPDP Rules, 2025 |
| **Evidence** | What the business must be able to show a regulator |
| **Coverage** | `MVP1` · `MVP2` · `MANUAL` (platform records it, humans do it) · `ROADMAP` (post-MVP) |

**Two rules govern how the platform treats everything here:**

1. **Nothing in this file becomes a constant in code.** Every number, deadline, retention period and class threshold is a row in the `ComplianceRule` table with a citation, an effective date and a DPO review flag.
2. **The platform never concludes.** It tracks, reminds, evidences and prompts. It does not decide whether a company is a Significant Data Fiduciary, whether an erasure must be granted, or whether a breach is notifiable. A human with the right permission does that, and the platform records who decided and when.

> **Not legal advice.** This is an engineering specification derived from the statute and the gazette. The values seeded into the Compliance Rules Engine are defaults for a DPO to review and confirm, not legal conclusions. Where the law says "without delay" or "reasonable", the platform stores the company's own chosen operational target and labels it as such.

---

## 1. STATUS OF THE LAW (as at the time of writing — re-verify before go-live)

The Digital Personal Data Protection Act, 2023 (Act 22 of 2023) received assent on 11 August 2023. The Digital Personal Data Protection Rules, 2025 were notified by MeitY on **13 November 2025** via **G.S.R. 846(E)**, published in the Gazette on 14 November 2025.

**Commencement is phased, per Rule 1:**

| Provisions | In force from |
|---|---|
| Rules 1, 2 and 17–21 (definitions, Board constitution, appointments, Board procedure, digital office) | Date of publication — **13/14 November 2025** |
| Rule 4 (registration and obligations of Consent Managers) | **One year** after publication — ~13 November 2026 |
| Rules 3, 5–16, 22 and 23 (notice, security safeguards, breach intimation, retention/erasure, DPO contact publication, children, persons with disability, SDF obligations, rights, cross-border, appeals, calling for information) | **Eighteen months** after publication — ~13 May 2027 |

The Data Protection Board of India has been constituted and is headquartered in the National Capital Region. In January 2026 MeitY floated a proposal to compress the eighteen-month window to twelve months and to fast-track notification of Significant Data Fiduciaries; whether that was gazetted, and in what form, must be checked before relying on any date here.

**Engineering consequence:** commencement dates are themselves configuration. Every `ComplianceRule` row carries `effectiveFrom`, so a compressed timeline is a settings change, not a release.

---

## 2. SCOPE — DOES THE ACT APPLY?

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| SC-01 | Determine whether the business processes **digital personal data** — personal data in digital form, or non-digital data later digitised. | s.3(a), s.2(n) | Data inventory showing systems, categories and volumes | MVP1 |
| SC-02 | Recognise extraterritorial reach: the Act applies to processing **outside India** where it relates to offering goods or services to Data Principals **in India**. | s.3(b) | Record of whether the fiduciary offers goods/services into India | MVP1 (org profile) |
| SC-03 | Identify processing that is **out of scope**: personal data made publicly available by the Data Principal herself, or by anyone under a legal obligation to publish. | s.3(c) | Justification recorded per source system | MVP1 (source flag) |
| SC-04 | Identify the entity's role for each processing activity — **Data Fiduciary** (determines purpose and means) or **Data Processor** (processes on another's behalf). | s.2(i), s.2(k) | Role determination per activity | MVP1 |
| SC-05 | Check exemptions before relying on any: notified State instrumentalities, judicial/regulatory functions, crime prevention, research/archiving/statistical purposes (subject to Second Schedule standards), and the startup exemption the Government may notify. | s.17, Rule 16, Second Schedule | Written exemption assessment | MANUAL (recorded in platform) |

---

## 3. LAWFUL BASIS

Under DPDP there are exactly **two** lawful bases. There is no "legitimate interest" balancing test as in GDPR.

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| LB-01 | Process personal data only for a **lawful purpose** for which the Data Principal has given **consent**, or for a **certain legitimate use**. | s.4(1) | Per-purpose lawful basis register | MVP1 (basis on purpose), MVP2 (enforced) |
| LB-02 | Record, for **every** processing purpose, which of the two bases applies. Never leave it blank and never infer it from the data itself. | s.4, s.7 | Purpose register with basis and justification | MVP1 |
| LB-03 | Where relying on **voluntary provision** — the Data Principal voluntarily provided data for a specified purpose and has not indicated she objects — record that fact and the objection channel. | s.7(a) | Evidence of voluntary provision | MVP2 |
| LB-04 | Where relying on **State function**, subsidy/benefit/service/certificate/licence/permit, medical emergency, epidemic/public health, disaster or public order, employment purposes, or safeguarding the employer from loss — record which limb of s.7 applies. | s.7(b)–(i) | Per-purpose s.7 limb, with the Second Schedule standards where the State limb applies | MVP2 |
| LB-05 | **Employment processing** (limb (i)) is a legitimate use — consent is not required, but purpose limitation and all s.8 obligations still apply. | s.7(i) | Employee data purpose register | MVP2 |
| LB-06 | Where a legitimate use applies, **do not present a consent screen** implying the individual has a choice she does not have. Inform instead. | s.5, s.7 | Notice copy per purpose | MVP2 |

---

## 4. NOTICE

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| NT-01 | Give a notice **on or before** requesting consent. Notice precedes consent; it is never retrofitted. | s.5(1) | Timestamped notice + consent pairing | MVP2 |
| NT-02 | Notice must be **presented and understandable independently** of any other information the fiduciary makes available — it cannot be a clause buried in T&Cs. | Rule 3(a) | The standalone notice artefact | MVP2 |
| NT-03 | Notice must give, in **clear and plain language**, a fair account of the details needed for specific and informed consent, including **at minimum an itemised description of the personal data**. | s.5(1), Rule 3(b)(i) | Itemised field list per notice version | MVP2 (built from MVP1 inventory) |
| NT-04 | Notice must state the **specified purpose(s)** and a **specific description of the goods or services provided, or uses enabled**, by that processing. | Rule 3(b)(ii) | Purpose + goods/services text per notice | MVP2 |
| NT-05 | Notice must give the **particular communication link** to the fiduciary's website or app, plus a description of any other means, by which the individual may **withdraw consent** — with ease **comparable to that with which consent was given**. | Rule 3(c)(i) | Withdrawal link stored on the notice version | MVP2 |
| NT-06 | Notice must give the means to **exercise her rights** under the Act. | Rule 3(c)(ii) | Rights link stored on the notice version | MVP2 |
| NT-07 | Notice must give the means to **make a complaint to the Board**. | Rule 3(c)(iii) | Board complaint link stored on the notice version | MVP2 |
| NT-08 | Make the notice available in **English or any language in the Eighth Schedule to the Constitution**, at the Data Principal's option (22 scheduled languages). | s.5(3) | Per-language notice versions | MVP2 (model + upload; translation is MANUAL) |
| NT-09 | Where consent was obtained **before the Act commenced**, give notice of that processing **as soon as reasonably practicable**, and continue processing only until she withdraws. | s.5(2) | Legacy-consent notice campaign records | MVP2 |
| NT-10 | Version every notice. When wording changes, a new version is created; consents already recorded stay bound to the version actually shown. | s.5, evidentiary necessity | Immutable notice versions with content hash | MVP2 |

---

## 5. CONSENT

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| CN-01 | Consent must be **free, specific, informed, unconditional and unambiguous, with a clear affirmative action**. No pre-ticked boxes, no bundling, no silence-as-agreement. | s.6(1) | Consent record with channel, timestamp, notice version | MVP2 |
| CN-02 | Consent signifies agreement to processing **only for the specified purpose** and is **limited to the personal data necessary** for it. Collecting more than is necessary is unlawful even with consent. | s.6(1) | Purpose ↔ data-category mapping | MVP1 (mapping), MVP2 (enforced) |
| CN-03 | Any part of a consent that infringes the Act or Rules is **invalid to that extent**. | s.6(2) | Consent construction review | MANUAL |
| CN-04 | The consent **request** must be accompanied or preceded by the notice, and must itself be available in English or an Eighth Schedule language. | s.6(3) | Consent request artefact per language | MVP2 |
| CN-05 | The Data Principal may **withdraw consent at any time**, and withdrawal must be **as easy as giving it**. | s.6(4), s.6(6), Rule 3(c)(i) | Withdrawal UI evidence + withdrawal records | MVP2 |
| CN-06 | Withdrawal does **not** invalidate processing already carried out lawfully before withdrawal. | s.6(5) | Consent history with effective dates | MVP2 |
| CN-07 | On withdrawal, **cease processing** for that purpose within a reasonable time — and cause processors to do the same. | s.6(6), s.8(7) | Downstream cessation record per system and processor | MVP2 (workflow + checklist) |
| CN-08 | Consent may be given, managed, reviewed and withdrawn through a registered **Consent Manager**; the Consent Manager is accountable to the Data Principal. | s.6(7)–(9), Rule 4, First Schedule | Consent Manager identity + registration on each consent so sourced | ROADMAP (model stub in MVP2) |
| CN-09 | Be able to **prove** consent: the fiduciary bears the burden of showing that notice was given and consent obtained in accordance with the Act. | s.6(10) | Consent record + notice version + content hash + channel + IP/user-agent | MVP2 |
| CN-10 | **Absence of evidence is not refusal.** Legacy records with no consent history are recorded as UNKNOWN, never as DENIED. | Evidentiary integrity | Consent status distribution report | MVP2 |
| CN-11 | Consent must be **purpose-specific**, not a single global flag. One person may consent to order updates and refuse marketing. | s.6(1) | Per-purpose consent matrix | MVP2 |

---

## 6. CHILDREN AND PERSONS WITH DISABILITY

A **child** is anyone under **eighteen**. This is stricter than GDPR (13–16) and COPPA (13).

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| CH-01 | Obtain **verifiable consent of the parent** before processing any personal data of a child. | s.9(1), Rule 10(1) | Guardian consent record with verification method | MVP2 |
| CH-02 | Adopt appropriate **technical and organisational measures** to ensure verifiable parental consent is actually obtained before processing. | Rule 10(1) | Age-gate design record, blocked-processing log | MVP2 |
| CH-03 | Observe **due diligence** that the person identifying as parent is an identifiable **adult** — by reference to reliable identity/age details already held, details voluntarily provided, or a **virtual token** mapped to such details issued by an authorised entity (including a Digital Locker service provider). | Rule 10(1)(a)–(b), Rule 10(2) | Verification method + token reference per guardian | MVP2 (record), MANUAL (integration) |
| CH-04 | Do **not** undertake processing likely to cause any **detrimental effect on the well-being** of a child. | s.9(2) | Assessment record per purpose involving children | MVP2 |
| CH-05 | Do **not** undertake **tracking or behavioural monitoring** of children, or **targeted advertising directed at children** — regardless of parental consent. | s.9(3) | Hard technical block + suppression log | **MVP2 — enforced in code, not policy** |
| CH-06 | Where relying on an exemption, confirm the class or purpose is actually listed: healthcare/clinical/mental-health/allied-health professionals, educational institutions, crèches and child-care centres, and school transport providers, each limited to the conditions in Part A. | s.9(4), Rule 12(1), Fourth Schedule Part A | Exemption assessment naming the Schedule row | MVP2 (recorded, with the row cited) |
| CH-07 | Purpose-based exemptions likewise: exercise of powers/duties in a child's interest under law; subsidies and benefits in a child's interest; creating a **user account limited to email communication**; determining **real-time location** in the interest of a child's safety; ensuring harmful information/services/advertisements are **not accessible** to a child; and confirming a Data Principal **is not** a child. | s.9(4), Rule 12(2), Fourth Schedule Part B | Exemption record naming the row and the condition | MVP2 |
| CH-08 | Obtain **verifiable consent of the lawful guardian** before processing personal data of a **person with disability** who has a lawful guardian. | s.9(1), Rule 11(1) | Guardian record + appointment evidence | MVP2 |
| CH-09 | Verify the guardian was appointed by a **court of law**, a **designated authority** under s.15 of the RPwD Act, 2016, or a **local level committee** under s.13 of the National Trust Act, 1999. | Rule 11(1)–(2) | Appointment order reference and verification note | MVP2 (record), MANUAL (verify) |
| CH-10 | Children's-data breaches attract the **second-highest penalty tier** — treat child records as a distinct risk class throughout. | Schedule, item 3 | Child-record inventory and access log | MVP2 |

---

## 7. GENERAL OBLIGATIONS OF THE DATA FIDUCIARY (Section 8)

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| GO-01 | The fiduciary is responsible for compliance **irrespective of any agreement to the contrary** and irrespective of the Data Principal's own failure to perform her duties — including for processing done on its behalf by a **Data Processor**. Liability cannot be contracted away. | s.8(1) | Accountability register; processor contracts that do not purport to shift statutory liability | MVP1 (processor register) |
| GO-02 | Engage a Data Processor **only under a valid contract**. | s.8(2) | Executed contract per processor, with date and scope | MVP1 (register + contract flag + expiry) |
| GO-03 | Where personal data is **likely to be used to make a decision affecting** the Data Principal, or **disclosed to another Data Fiduciary**, ensure its **completeness, accuracy and consistency**. | s.8(3) | Identity-resolution audit, conflict register, correction workflow | **MVP1 — this is what identity resolution is for** |
| GO-04 | Implement appropriate **technical and organisational measures** to ensure effective observance of the Act and Rules. | s.8(4) | Policy set, RBAC configuration, training records, audit log | MVP1 + MVP2 |
| GO-05 | Protect personal data in possession or control by taking **reasonable security safeguards** to prevent a personal data breach — including for processing by a processor. **This obligation survives every exemption in s.17(1).** | s.8(5), Rule 6 | See section 8 below | MVP1 |
| GO-06 | On a personal data breach, give intimation to the **Board and each affected Data Principal**. | s.8(6), Rule 7 | See section 9 below | MVP2 |
| GO-07 | **Erase** personal data on withdrawal of consent or when the specified purpose is no longer served, whichever is earlier — unless retention is necessary for compliance with law — and **cause processors to erase** it too. | s.8(7) | Erasure records per system and per processor | MVP2 |
| GO-08 | Treat the purpose as no longer served where the Data Principal **neither approaches** the fiduciary for that purpose **nor exercises any right** for the prescribed period. Both limbs must be true. | s.8(8), s.8(11), Rule 8 | Last-contact timestamp per Data Principal | MVP1 (field) → MVP2 (engine) |
| GO-09 | "Approach" means the Data Principal **initiated contact** — in person or by electronic or physical communication. System-generated messages from the company do not count. | s.8(11) | Contact-event log distinguishing inbound from outbound | MVP2 |
| GO-10 | **Publish** the business contact information of the **Data Protection Officer** (if applicable) or of a person able to answer questions about processing. | s.8(9), Rule 9 | Published page + the published value in the org profile | MVP1 |
| GO-11 | Establish an **effective mechanism to redress grievances**. | s.8(10) | Grievance workflow, response times, closure records | MVP2 |

---

## 8. REASONABLE SECURITY SAFEGUARDS (Rule 6)

Rule 6 sets the floor. Each item below is a **minimum**, not a menu.

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| SE-01 | Secure personal data through **encryption, obfuscation, masking, or virtual tokens** mapped to that data. | Rule 6(1)(a) | Encryption inventory per store; masking rules | MVP1 (platform's own data) + MVP1 (register for company systems) |
| SE-02 | Appropriate measures to **control access** to the computer resources used by the fiduciary or its processor. | Rule 6(1)(b) | RBAC matrix, access reviews, joiner/mover/leaver records | MVP1 |
| SE-03 | **Visibility on access** to personal data through appropriate **logs, monitoring and review**, enabling detection of unauthorised access, investigation and remediation. | Rule 6(1)(c) | Access log of every personal-data view, with actor and time | **MVP1 — `PERSONAL_DATA_VIEWED` audit events** |
| SE-04 | Reasonable measures for **continued processing** if confidentiality, integrity or availability is compromised — e.g. **data backups**. | Rule 6(1)(d) | Backup schedule, restore test records | MVP1 (platform) + MANUAL (company systems, recorded) |
| SE-05 | **Retain those logs and personal data for one year** to enable detection, investigation, remediation and continued processing — unless another law requires otherwise. | Rule 6(1)(e) | Log retention configuration and proof of enforcement | MVP1 (configurable retention, default 1 year) |
| SE-06 | Include **appropriate security provisions in the contract** with each Data Processor. | Rule 6(1)(f) | Contract clause checklist per processor | MVP1 (processor register with clause checklist) |
| SE-07 | Appropriate **technical and organisational measures** to ensure effective observance of the safeguards. | Rule 6(1)(g) | Policies, reviews, sign-offs | MVP1 + MANUAL |
| SE-08 | Note the interaction with **CERT-In** directions: certain cyber incidents must be reported to CERT-In within **6 hours**, separately from DPDP breach intimation. Two clocks, two regulators. | IT Act, 2000 / CERT-In Directions 2022 | Incident timeline showing both notifications | MVP2 (parallel obligation timer, configurable) |

---

## 9. PERSONAL DATA BREACH (Section 8(6), Rule 7)

A **personal data breach** is any unauthorised processing, or accidental disclosure, acquisition, sharing, use, alteration, destruction or loss of access, that compromises confidentiality, integrity or availability (s.2(u)). **There is no materiality threshold** — the Rules do not limit intimation to "high risk" breaches as GDPR does.

### 9.1 To each affected Data Principal — without delay

| ID | Obligation | Source | Coverage |
|---|---|---|---|
| BR-01 | Intimate **each affected Data Principal**, to the best of the fiduciary's knowledge, in a **concise, clear and plain manner and without delay**, via her user account or any communication mode she registered. | Rule 7(1) | MVP2 |
| BR-02 | The intimation must describe the breach — its **nature, extent and timing of occurrence**. | Rule 7(1)(a) | MVP2 |
| BR-03 | …the **consequences relevant to her** likely to arise from the breach. | Rule 7(1)(b) | MVP2 |
| BR-04 | …the **measures implemented and being implemented** by the fiduciary to mitigate risk. | Rule 7(1)(c) | MVP2 |
| BR-05 | …the **safety measures she may take** to protect her interests. | Rule 7(1)(d) | MVP2 |
| BR-06 | …the **business contact information** of a person able to respond to her queries on the fiduciary's behalf. | Rule 7(1)(e) | MVP2 |

### 9.2 To the Data Protection Board — two stages

| ID | Obligation | Source | Coverage |
|---|---|---|---|
| BR-07 | **Without delay**, intimate the Board with a description of the breach: **nature, extent, timing and location of occurrence, and likely impact**. | Rule 7(2)(a) | MVP2 |
| BR-08 | **Within 72 hours** of becoming aware — or such longer period as the Board allows **on a written request** — furnish updated and detailed information on that description. | Rule 7(2)(b) | MVP2 |
| BR-09 | …the **broad facts** of the events, circumstances and reasons leading to the breach. | Rule 7(2)(b)(ii) | MVP2 |
| BR-10 | …**measures implemented or proposed** to mitigate risk. | Rule 7(2)(b)(iii) | MVP2 |
| BR-11 | …any **findings regarding the person who caused** the breach. | Rule 7(2)(b)(iv) | MVP2 |
| BR-12 | …**remedial measures** taken to prevent recurrence. | Rule 7(2)(b)(v) | MVP2 |
| BR-13 | …a **report on the intimations given to affected Data Principals** — so the platform must be able to produce delivery evidence per person. | Rule 7(2)(b)(vi) | MVP2 |
| BR-14 | The 72-hour clock runs from **becoming aware**, not from incident occurrence and not from when someone opened a ticket. Record both timestamps separately. | Rule 7(2)(b) | MVP2 |
| BR-15 | Record any **extension request** made in writing to the Board and the Board's response; the deadline shifts only on that record. | Rule 7(2)(b) | MVP2 |

---

## 10. RETENTION AND ERASURE (Section 8(7)–(8), Rule 8, Third Schedule)

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| RE-01 | Erase personal data on **withdrawal of consent**, or when the **specified purpose is no longer served**, whichever is earlier — unless retention is necessary for compliance with law. | s.8(7)(a) | Erasure job records with trigger and legal-hold reason | MVP2 |
| RE-02 | **Cause the Data Processor to erase** any personal data made available to it. | s.8(7)(b) | Processor erasure confirmations | MVP2 (workflow + confirmation record) |
| RE-03 | For the classes in the **Third Schedule**, erase after **three years** from the date the Data Principal last approached the fiduciary for the specified purpose or last exercised her rights (or from commencement of the Rules, whichever is latest): **e-commerce entities with ≥ 2 crore registered users in India**; **online gaming intermediaries with ≥ 50 lakh**; **social media intermediaries with ≥ 2 crore**. | Rule 8(1), Third Schedule | Class determination + user count + last-contact timestamps | MVP2 |
| RE-04 | The Third Schedule three-year rule does **not** apply to data needed to let the Data Principal **access her user account**, or to access a **virtual token** issued by the fiduciary, stored on its platform, usable to get money, goods or services. | Third Schedule col. (3) | Carve-out configuration per retention policy | MVP2 |
| RE-05 | **At least 48 hours before** the erasure period completes, inform the Data Principal that her data will be erased unless she logs in, initiates contact for the specified purpose, or exercises her rights. | Rule 8(2) | Pre-erasure notice records with send timestamps | MVP2 |
| RE-06 | Independently of the above, **retain personal data, associated traffic data and processing logs for a minimum of one year** from the date of processing, for the Seventh Schedule purposes — then erase, unless another law requires longer. | Rule 8(3) | Log retention configuration and enforcement records | MVP1 (config) + MVP2 (enforcement) |
| RE-07 | Reconcile the tension: s.8(7) says erase; Rule 6(1)(e) and Rule 8(3) require a one-year minimum retention. The Rules are law for the time being in force, so the minimum retention prevails. **The platform must never let an erasure job delete data still inside a mandatory retention window** — it marks it for erasure at window end. | s.8(7) read with Rule 6(1)(e), Rule 8(3) | Deferred-erasure queue with release dates | MVP2 |
| RE-08 | Maintain a **retention schedule** per purpose and data category, with the legal basis for each period (statutory, sectoral — RBI/SEBI/IRDAI/Companies Act — or company policy). | s.8(7) exception | Retention policy register with cited basis | MVP1 (model), MVP2 (engine) |
| RE-09 | Track **last approach** per Data Principal, counting only **inbound, principal-initiated** contact. | s.8(8), s.8(11) | `lastPrincipalContactAt` with event provenance | MVP1 (field) + MVP2 (engine) |

---

## 11. DATA PRINCIPAL RIGHTS (Sections 11–14, Rule 14)

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| RT-01 | **Prominently publish** on the website or app the **details of the means** by which a Data Principal may make a request to exercise her rights. | Rule 14(1)(a) | The published page + stored configuration | MVP2 |
| RT-02 | **Prominently publish** the **particulars** (username or other identifier) that may be required to identify her under the terms of service. | Rule 14(1)(b), Rule 14(5) | Published identifier requirements | MVP2 |
| RT-03 | **Right to access**: on request, provide a **summary of the personal data being processed** and of the **processing activities** undertaken. | s.11(1)(a) | Generated access report per request | **MVP2 — built directly on the MVP1 canonical profile** |
| RT-04 | **Right to access**: provide the **identities of all other Data Fiduciaries and Data Processors** with whom her personal data has been shared, **along with a description of the personal data so shared**. | s.11(1)(b) | Sharing register, filtered per principal | **MVP1 (register) + MVP2 (report)** |
| RT-05 | Provide any other prescribed information relating to her personal data and its processing. | s.11(1)(c) | Report template versioning | MVP2 |
| RT-06 | Note the scope limit: s.11 applies to the fiduciary **to whom she has previously given consent**, including consent under s.7(a). Do not silently narrow it further, and do not overclaim it. | s.11(1) | Basis check recorded on each access request | MVP2 |
| RT-07 | **Right to correction, completion, updating and erasure** of personal data for which she previously gave consent. | s.12(1) | Correction workflow with before/after and source system | MVP2 |
| RT-08 | On request, **correct inaccurate or misleading** data, **complete incomplete** data, and **update** data. | s.12(2) | Per-field change records | MVP2 |
| RT-09 | On request, **erase** her personal data unless retention is necessary for the specified purpose or for compliance with law — and state which, if refusing. | s.12(3) | Erasure decision with reason and legal citation | MVP2 |
| RT-10 | **Right of grievance redressal**: provide readily available means to register a grievance about any act or omission regarding her rights or the fiduciary's obligations. | s.13(1) | Grievance channel + records | MVP2 |
| RT-11 | Respond to grievances within the period the fiduciary publishes, which **must not exceed ninety days**, and implement technical and organisational measures to make the system effective within that period. | s.13(2), Rule 14(3) | Published period + response-time report | **MVP2 — the only hard statutory response deadline in the Rules** |
| RT-12 | Recognise that the Data Principal must **exhaust** the fiduciary's grievance mechanism **before** approaching the Board. Do not obstruct it, and do not hide the Board route either. | s.13(3) | Grievance closure notices citing next steps | MVP2 |
| RT-13 | **Right to nominate** one or more individuals to exercise her rights in the event of death or incapacity, using the means and particulars the fiduciary requires. | s.14, Rule 14(4) | Nomination records with scope and activation conditions | MVP2 |
| RT-14 | Requests are made **using the means and particulars the fiduciary requires** — so identity verification is legitimate, but it must be published in advance and must not be used to frustrate the right. | Rule 14(2), Rule 14(5) | Verification method per request | MVP2 |
| RT-15 | **Duties of the Data Principal** exist (no impersonation, no suppression of material information, no false or frivolous grievances, only authentic information) and carry a penalty up to ₹10,000 — but a Data Principal's breach of duty **never reduces** the fiduciary's obligations. | s.15, s.8(1), Schedule item 5 | Frivolous-request flag with reason, no auto-rejection | MVP2 |
| RT-16 | Mention the **DPO's or responsible person's business contact information in every response** to a rights-exercise communication. | Rule 9 | Response template containing the contact block | MVP2 |

---

## 12. PROCESSORS, SHARING AND CROSS-BORDER

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| PR-01 | Maintain a register of every **Data Processor**, what it processes, for which purpose, under which contract, with contract date and expiry. | s.8(2) | Processor register | MVP1 |
| PR-02 | Ensure each processor contract carries **security safeguard provisions**. | Rule 6(1)(f) | Clause checklist per contract | MVP1 |
| PR-03 | Maintain a register of every **other Data Fiduciary** with whom personal data is shared, and **a description of the data shared** — this is what makes RT-04 answerable. | s.11(1)(b) | Sharing register with categories per recipient | MVP1 |
| PR-04 | Track **sub-processors**: liability flows up the chain to the fiduciary regardless of how many tiers exist. | s.8(1) | Sub-processor disclosures per processor | MVP1 (field) |
| PR-05 | Ensure processors **erase** data when the fiduciary must, and obtain confirmation. | s.8(7)(b) | Erasure confirmations | MVP2 |
| CB-01 | Personal data may be transferred **outside India**, subject to meeting any requirements the Central Government specifies by general or special order regarding making that data available to a **foreign State**, or a person/entity under such a State's control. | s.16, Rule 15 | Transfer register: recipient, country, purpose, safeguards | MVP1 (register) + MVP2 (restriction checks) |
| CB-02 | Note that s.16(2) preserves **stricter sectoral laws** — RBI, SEBI, IRDAI and others may prohibit transfers the DPDP framework would allow. | s.16(2) | Sectoral restriction flags per transfer | MVP2 |
| CB-03 | For a **Significant Data Fiduciary**, specified categories of personal data and their traffic data may be restricted from leaving India entirely. | Rule 13(4) | Localisation flag per data category | MVP2 |

---

## 13. SIGNIFICANT DATA FIDUCIARY (Section 10, Rule 13)

The Central Government notifies a fiduciary or class as an SDF based on volume and sensitivity of personal data processed, risk to Data Principals' rights, potential impact on India's sovereignty and integrity, risk to electoral democracy, security of the State and public order.

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| SD-01 | Appoint a **Data Protection Officer** who is **based in India**, is responsible to the board of directors or equivalent, and is the point of contact for the grievance mechanism. | s.10(2)(a) | DPO appointment record with India residency | MVP2 |
| SD-02 | Appoint an **independent data auditor** to evaluate compliance. | s.10(2)(b) | Auditor engagement record | MVP2 |
| SD-03 | Undertake a **Data Protection Impact Assessment and an audit once every twelve months**, from the date of notification as an SDF or inclusion in a notified class. | s.10(2)(c), Rule 13(1) | Dated DPIA and audit records with the 12-month clock | MVP2 |
| SD-04 | Cause the person carrying out the DPIA and audit to **furnish a report of significant observations to the Board**. | Rule 13(2) | Submitted report + submission evidence | MVP2 |
| SD-05 | Observe **due diligence to verify that technical measures, including algorithmic software**, used for hosting, display, uploading, modification, publishing, transmission, storage, updating or sharing of personal data are **not likely to pose a risk to Data Principals' rights**. | s.10(2)(c)(ii), Rule 13(3) | Algorithm register with risk review per system | MVP2 |
| SD-06 | Ensure personal data **specified by the Central Government** (on a committee's recommendation) — and traffic data pertaining to its flow — is **not transferred outside India**. | Rule 13(4)–(5) | Localisation controls and transfer blocks | MVP2 |
| SD-07 | Non-SDFs should still track these obligations: SDF status can be conferred by notification at any time, and MeitY has signalled it may fast-track that. | s.10(1) | SDF readiness assessment | MVP2 (flag + readiness view) |

---

## 14. BOARD AND GOVERNMENT INTERACTION

| ID | Obligation | Source | Evidence | Coverage |
|---|---|---|---|---|
| BD-01 | The Board functions as a **digital office** and may conduct proceedings without physical presence; correspondence will be digital. | Rule 20 | Correspondence log | MVP2 |
| BD-02 | Board inquiries under s.27 are to be **completed within six months** of receipt of intimation/complaint/reference/direction, extendable in writing by up to three months at a time. | Rule 19(9) | Inquiry tracker | MVP2 |
| BD-03 | Furnish information the Central Government calls for under Rule 23, through the authorised person specified in the **Seventh Schedule**, within the specified period. | Rule 23(1), Seventh Schedule | Information-request register with response evidence | MVP2 |
| BD-04 | Where disclosure would prejudicially affect India's sovereignty and integrity or security of the State, the Government may require the fiduciary **not to disclose** the request to the affected Data Principal or anyone else without prior written permission. **The platform must be able to suppress a record from the Data Principal portal on that basis** and log why. | Rule 23(2) | Restricted-disclosure flag with authorisation reference | MVP2 |
| BD-05 | Appeals from Board orders go to the **Appellate Tribunal** (TDSAT), filed digitally, with fees payable via UPI or another RBI-authorised system. | s.29, Rule 22 | Appeal record | MANUAL |
| BD-06 | A **voluntary undertaking** may be accepted by the Board; breaching it attracts the penalty applicable to the underlying breach. | s.32, Schedule item 6 | Undertaking register with commitments and due dates | MVP2 (tracked as compliance rules) |

---

## 15. PENALTIES (Section 33 and the Schedule)

Penalties are **fixed-rupee caps, not turnover-linked**, imposed by the Board after inquiry, and are assessed **per instance** — one incident can breach several items and attract several penalties.

| Item | Contravention | Maximum |
|---|---|---|
| 1 | Failure to take **reasonable security safeguards** to prevent a personal data breach (s.8(5)) | **₹250 crore** |
| 2 | Failure to **notify the Board and affected Data Principals** of a breach (s.8(6)) | **₹200 crore** |
| 3 | Breach of **children's-data obligations** (s.9) | **₹200 crore** |
| 4 | Breach of **additional Significant Data Fiduciary obligations** (s.10) | **₹150 crore** |
| 5 | Breach of the **Data Principal's duties** (s.15) | **₹10,000** |
| 6 | Breach of a term of an accepted **voluntary undertaking** (s.32) | Up to the extent applicable to the underlying breach |
| 7 | **Any other** breach of the Act or Rules | **₹50 crore** |

Under s.33(2) the Board weighs the nature, gravity and duration of the breach; the type and nature of personal data affected; repetitive character; whether any gain was made or loss avoided; whether and how promptly mitigation was undertaken; proportionality and effectiveness of the penalty; and its likely impact.

**Product consequence:** the audit trail, consent evidence, breach timeline and remediation record the platform produces are precisely the mitigation evidence s.33(2) contemplates. That is the value proposition, and it should be stated in exactly those terms — never as "this software makes you compliant".

---

## 16. THE EVIDENCE PACK — what a company must be able to produce on demand

If a regulator, auditor or Board inquiry arrives, these artefacts must be retrievable within minutes. Every one of them is a platform export.

| ID | Artefact | Built from | Coverage |
|---|---|---|---|
| EV-01 | **Data inventory** — systems, categories, volumes, purposes, lawful basis | Data sources + mappings + purposes | MVP1 |
| EV-02 | **Record of Processing Activities** — purpose, basis, categories, recipients, retention, cross-border | Purpose register + sharing register + retention policies | MVP1 → MVP2 |
| EV-03 | **Per-person evidence file** — every consent event, notice version shown, request, message received, breach inclusion | Principal evidence page | MVP2 |
| EV-04 | **Consent ledger** — status, history, channel, notice version and content hash, evidence metadata | Consent records + events | MVP2 |
| EV-05 | **Rights request register** — type, dates, deadline, rule applied, outcome, reason | Request engine | MVP2 |
| EV-06 | **Grievance response-time report** against the published period | Request engine filtered to grievances | MVP2 |
| EV-07 | **Breach file** — awareness time, both Board intimations, per-person delivery evidence, remediation | Breach module | MVP2 |
| EV-08 | **Access log** of who viewed whose personal data, retained one year | Audit events | MVP1 |
| EV-09 | **Processor and sharing register** with contracts and security clauses | Registers | MVP1 |
| EV-10 | **Retention schedule** with legal basis and erasure execution records | Retention module | MVP2 |
| EV-11 | **DPIA and audit records** for SDFs, with the 12-month clock | SDF module | MVP2 |
| EV-12 | **Immutable audit log** with verifiable hash chain, exportable to CSV | Audit module | MVP1 → MVP2 |

---

## 17. COVERAGE SUMMARY

| Area | MVP 1 | MVP 2 |
|---|---|---|
| Scope, roles, inventory | SC-01…05, SC-04 | — |
| Lawful basis | LB-02 (register) | LB-01, LB-03…06 |
| Notice | — | NT-01…10 |
| Consent | CN-02 (mapping) | CN-01…11 |
| Children & guardians | — | CH-01…10 |
| General obligations | GO-01…05, GO-08, GO-10 | GO-06, GO-07, GO-09, GO-11 |
| Security safeguards | SE-01…07 | SE-08 |
| Breach | — | BR-01…15 |
| Retention & erasure | RE-06, RE-08, RE-09 (model) | RE-01…09 (engine) |
| Rights | RT-04 (register) | RT-01…16 |
| Processors, sharing, cross-border | PR-01…04, CB-01 | PR-05, CB-02…03 |
| Significant Data Fiduciary | — | SD-01…07 |
| Board & Government | — | BD-01…04, BD-06 |
| Evidence pack | EV-01, EV-02, EV-08, EV-09, EV-12 | EV-03…07, EV-10, EV-11 |

**Deliberately out of scope for both MVPs** (record-only or roadmap): Consent Manager platform integration (CN-08 — the registration framework itself only commences around November 2026); automated filing with the Board (the platform generates and records, a human submits); DigiLocker / virtual-token identity verification integration (CH-03 — the platform records which method was used); automated translation of notices into Eighth Schedule languages (NT-08 — the platform stores and serves per-language versions, a human supplies the translation); actual encryption of the customer's own source systems (SE-01 — the platform registers what exists, it cannot enforce it through a read-only API).

---

## 18. THE TEN THINGS MOST LIKELY TO GO WRONG IN THE BUILD

These are the failure modes that would make the platform produce **false compliance records** — worse than producing none.

1. **Inferring purpose from data shape.** A column called `email` in a table called `marketing` does not establish a marketing purpose. Purpose and lawful basis are always configured by a human. (LB-02)
2. **Recording UNKNOWN consent as DENIED.** Absence of evidence is not refusal. (CN-10)
3. **Hard-coding 90, 72, 48, 30 or 3-years.** Every one is a `ComplianceRule` row with a citation. (§1 of this file)
4. **Recomputing deadlines when a rule changes.** The rule version is snapshotted onto the request or incident at creation. (RT-11, BR-08)
5. **Starting the breach clock from record creation** instead of from becoming aware. (BR-14)
6. **Letting an erasure job delete data inside a mandatory one-year retention window.** (RE-07)
7. **Sending marketing to a child** because a parent consented. s.9(3) prohibits it regardless of consent. (CH-05)
8. **Treating a compliance notice as marketing** — or the reverse. A breach notice reaches everyone affected regardless of marketing consent; a promotion reaches only those who granted it. (BR-01, CN-11)
9. **Merging two different people** because their names match — which creates a data breach inside the privacy product itself. (GO-03)
10. **Claiming the company is compliant.** The platform supports, evidences and reminds. It never concludes. (§0 of this file)
