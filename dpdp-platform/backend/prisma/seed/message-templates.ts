/**
 * The fifteen system `MessageTemplate` rows, transcribed verbatim (code
 * list) from DPDP_MVP2_COMPLIANCE_OPERATIONS.md lines 775-780, all
 * markdown, all `isSystem: true`, all editable (nothing in this codebase
 * blocks a PATCH to an `isSystem` row -- `isSystem` is informational,
 * marking these as the platform-provided defaults).
 *
 * Every `bodyMarkdown`/`subject` below uses ONLY names from
 * `TEMPLATE_VARIABLE_WHITELIST` (verified by `extractTemplateVariables`
 * at seed time -- this file throws, rather than silently seeding a
 * broken row, if any template text ever drifts outside the whitelist).
 * `variables` is derived the same way the API derives it on create/
 * update, not hand-maintained here.
 *
 * `BREACH_NOTIFICATION`'s body carries all six of
 * `BREACH_NOTIFICATION_REQUIRED_ELEMENTS` (Rule 7(1)'s five narrative
 * elements plus the breach reference) by default. `PRE_ERASURE_NOTICE`'s
 * body carries all three Rule 8(2) ways to stop erasure (log into your
 * user account / contact the company for the specified purpose /
 * exercise your rights) as literal phrases, not variables -- there is no
 * whitelisted variable for "the three conditions", they are prose this
 * seed writes directly.
 *
 * Exported as `SYSTEM_MESSAGE_TEMPLATES` (raw definitions, code +
 * category + subject + bodyMarkdown + requiredVariables) and
 * `seedMessageTemplates(prisma, organizationId)` (the idempotent apply
 * function, same shape as `seedRoles(prisma, organizationId)` in
 * `prisma/seed.ts`) for the integrator to wire into `runSeed`. NOT
 * self-registering -- this task does not touch `prisma/seed.ts`.
 */
import type { MessageCategory } from "@prisma/client";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { extractTemplateVariables } from "../../src/modules/messaging/templates/template-renderer";

export interface SystemMessageTemplateSeed {
  code: string;
  name: string;
  category: MessageCategory;
  subject: string;
  bodyMarkdown: string;
  requiredVariables: readonly string[];
}

export const SYSTEM_MESSAGE_TEMPLATES: readonly SystemMessageTemplateSeed[] = [
  {
    code: "NOTICE_STANDARD",
    name: "Standard privacy notice",
    category: "NOTICE",
    subject: "Update regarding your personal data at {{company_name}}",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "{{company_name}} is writing to keep you informed about how your personal data is processed.",
      "",
      "**Data categories involved:** {{data_categories}}",
      "**Purpose:** {{purpose_name}}",
      "**Notice version:** {{notice_version}}",
      "",
      "You can review the current notice, manage your consents, or reach us at any time:",
      "",
      "- Notice and consent portal: {{portal_link}}",
      "- Withdraw consent: {{withdrawal_url}}",
      "- Your rights: {{rights_url}}",
      "",
      "If you have questions, contact {{contact_email}}.",
      "",
      "Regards,",
      "{{dpo_name}}",
      "{{dpo_contact}}",
    ].join("\n"),
    requiredVariables: ["principal_name", "company_name", "portal_link", "dpo_name", "dpo_contact"],
  },
  {
    code: "CONSENT_REQUEST",
    name: "Consent request",
    category: "CONSENT_REQUEST",
    subject: "Please review and respond: consent for {{purpose_name}}",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "{{company_name}} is asking for your consent to process the following personal data for **{{purpose_name}}**.",
      "",
      "**Data categories:** {{data_categories}}",
      "**Notice version:** {{notice_version}}",
      "",
      "Please review the notice and record your choice:",
      "",
      "- Read the notice and respond: {{portal_link}}",
      "- Withdraw consent at any time: {{withdrawal_url}}",
      "- Learn about your rights: {{rights_url}}",
      "",
      "Reference: {{reference}}",
      "",
      "Questions? Write to {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "purpose_name",
      "portal_link",
      "reference",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "LEGACY_CONSENT_NOTICE",
    name: "Legacy (pre-existing) consent notice",
    category: "NOTICE",
    subject: "Your existing consent on record with {{company_name}}",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "Our records show an existing consent, collected before {{company_name}}'s current consent process, covering **{{purpose_name}}** (data categories: {{data_categories}}).",
      "",
      "Under the applicable notice ({{notice_version}}), you can review, confirm, or withdraw this consent at any time:",
      "",
      "- Manage your consent: {{portal_link}}",
      "- Withdraw consent: {{withdrawal_url}}",
      "- Your rights: {{rights_url}}",
      "",
      "Contact us at {{contact_email}} or reach our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}), with any questions.",
    ].join("\n"),
    requiredVariables: ["principal_name", "company_name", "purpose_name", "portal_link", "dpo_name", "dpo_contact"],
  },
  {
    code: "BREACH_NOTIFICATION",
    name: "Personal data breach notification",
    category: "BREACH_NOTICE",
    subject: "Important: personal data breach notice ({{breach_reference}})",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "{{company_name}} is writing to inform you of a personal data breach affecting your personal data. This notice is provided under Rule 7(1) of the Digital Personal Data Protection Rules.",
      "",
      "**Breach reference:** {{breach_reference}}",
      "",
      "**Nature, extent, and timing of the breach**",
      "{{breach_nature_extent_timing}}",
      "",
      "**Likely consequences relevant to you**",
      "{{breach_consequences}}",
      "",
      "**Mitigation measures implemented and being implemented**",
      "{{breach_mitigation}}",
      "",
      "**Safety measures you may take**",
      "{{breach_safety_measures}}",
      "",
      "**Contact for questions about this breach**",
      "{{breach_responder_contact}}",
      "",
      "You may also reach our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}), or write to {{contact_email}}.",
      "",
      "Reference: {{reference}}",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "breach_reference",
      "breach_nature_extent_timing",
      "breach_consequences",
      "breach_mitigation",
      "breach_safety_measures",
      "breach_responder_contact",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "BOARD_INITIAL_INTIMATION",
    name: "Board initial breach intimation",
    category: "COMPLIANCE_NOTICE",
    subject: "Initial intimation of personal data breach — {{breach_reference}}",
    bodyMarkdown: [
      "**Initial intimation of personal data breach**",
      "",
      "Reference: {{breach_reference}}",
      "",
      "Nature, extent and timing: {{breach_nature_extent_timing}}",
      "",
      "Mitigation measures: {{breach_mitigation}}",
      "",
      "Submitted by {{company_name}}. Contact for this matter: {{breach_responder_contact}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: [
      "breach_reference",
      "breach_nature_extent_timing",
      "breach_mitigation",
      "breach_responder_contact",
      "company_name",
      "dpo_contact",
    ],
  },
  {
    code: "BOARD_DETAILED_REPORT",
    name: "Board detailed breach report",
    category: "COMPLIANCE_NOTICE",
    subject: "Detailed report of personal data breach — {{breach_reference}}",
    bodyMarkdown: [
      "**Detailed report of personal data breach**",
      "",
      "Reference: {{breach_reference}}",
      "",
      "**Nature, extent, timing:** {{breach_nature_extent_timing}}",
      "",
      "**Consequences:** {{breach_consequences}}",
      "",
      "**Mitigation implemented and being implemented:** {{breach_mitigation}}",
      "",
      "**Safety measures for affected Data Principals:** {{breach_safety_measures}}",
      "",
      "**Contact:** {{breach_responder_contact}} / {{dpo_contact}}",
      "",
      "Submitted by {{company_name}}, Data Protection Officer {{dpo_name}}.",
    ].join("\n"),
    requiredVariables: [
      "breach_reference",
      "breach_nature_extent_timing",
      "breach_consequences",
      "breach_mitigation",
      "breach_safety_measures",
      "breach_responder_contact",
      "company_name",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "REQUEST_RECEIVED",
    name: "Rights request received",
    category: "REQUEST_UPDATE",
    subject: "We've received your {{request_type}} request ({{reference}})",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "{{company_name}} has received your **{{request_type}}** request, reference **{{reference}}**.",
      "",
      "We aim to respond by **{{due_date}}**.",
      "",
      "Track your request or add details: {{portal_link}}",
      "",
      "Questions? Contact {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "request_type",
      "reference",
      "due_date",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "REQUEST_COMPLETED",
    name: "Rights request completed",
    category: "REQUEST_UPDATE",
    subject: "Your {{request_type}} request ({{reference}}) is complete",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "Your **{{request_type}}** request, reference **{{reference}}**, has been completed by {{company_name}}.",
      "",
      "Review the outcome in your portal: {{portal_link}}",
      "",
      "If you have questions about this outcome, contact {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}), whose business contact information is provided here as required under Rule 9.",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "request_type",
      "reference",
      "portal_link",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "REQUEST_REJECTED",
    name: "Rights request rejected",
    category: "REQUEST_UPDATE",
    subject: "Update on your {{request_type}} request ({{reference}})",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "{{company_name}} has reviewed your **{{request_type}}** request, reference **{{reference}}**, and is unable to action it as submitted.",
      "",
      "You can review the decision and your options, including escalation, in your portal: {{portal_link}}",
      "Learn about your rights: {{rights_url}}",
      "",
      "Contact {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}), with any questions.",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "request_type",
      "reference",
      "portal_link",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "CORRECTION_UPDATE",
    name: "Correction request update",
    category: "REQUEST_UPDATE",
    subject: "Correction request update ({{reference}})",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "We're writing about your correction request, reference **{{reference}}**, submitted to {{company_name}}.",
      "",
      "Status and details: {{portal_link}}",
      "",
      "Questions? Contact {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: ["principal_name", "company_name", "reference", "portal_link", "dpo_name", "dpo_contact"],
  },
  {
    code: "ERASURE_UPDATE",
    name: "Erasure request update",
    category: "REQUEST_UPDATE",
    subject: "Erasure request update ({{reference}})",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "This is an update on your erasure request, reference **{{reference}}**, with {{company_name}}.",
      "",
      "Scheduled erasure date: {{erasure_date}}",
      "",
      "View details: {{portal_link}}",
      "",
      "Questions? Contact {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "reference",
      "erasure_date",
      "portal_link",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "PRE_ERASURE_NOTICE",
    name: "Pre-erasure notice",
    category: "PRE_ERASURE_NOTICE",
    subject: "Your data with {{company_name}} is scheduled for erasure",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "Under our retention policy, personal data associated with your account at {{company_name}} for **{{purpose_name}}** is scheduled to be erased on **{{erasure_date}}**, unless it is still needed for the purpose for which it was collected.",
      "",
      "You can stop this erasure in any of these ways:",
      "",
      "1. **Log into your user account** and remain active: {{portal_link}}",
      "2. **Contact the company for the specified purpose** the data was collected for, at {{contact_email}}",
      "3. **Exercise your rights** in respect of this data: {{rights_url}}",
      "",
      "If we don't hear from you by {{erasure_date}}, this data will be erased in the ordinary course.",
      "",
      "Questions? Contact our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "purpose_name",
      "erasure_date",
      "portal_link",
      "contact_email",
      "rights_url",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "GRIEVANCE_ACKNOWLEDGED",
    name: "Grievance acknowledged",
    category: "REQUEST_UPDATE",
    subject: "We've received your grievance ({{reference}})",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "{{company_name}} acknowledges receipt of your grievance, reference **{{reference}}**.",
      "",
      "Under our published grievance redressal process, you can expect a response within **{{published_grievance_period}}**.",
      "",
      "Track your grievance: {{portal_link}}",
      "If unresolved, you may also raise this with the Data Protection Board: {{board_complaint_url}}",
      "",
      "Contact {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "reference",
      "published_grievance_period",
      "portal_link",
      "dpo_name",
      "dpo_contact",
    ],
  },
  {
    code: "PRIVACY_NOTICE_UPDATE",
    name: "Privacy notice updated",
    category: "NOTICE",
    subject: "{{company_name}}'s privacy notice has been updated",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "{{company_name}}'s privacy notice has been updated to version **{{notice_version}}**.",
      "",
      "Data categories and purposes covered include **{{purpose_name}}** ({{data_categories}}).",
      "",
      "Please review the updated notice: {{portal_link}}",
      "You may withdraw consent at any time: {{withdrawal_url}}",
      "Your rights: {{rights_url}}",
      "",
      "Contact {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: ["principal_name", "company_name", "notice_version", "portal_link", "dpo_name", "dpo_contact"],
  },
  {
    code: "ACCESS_REPORT_COVER",
    name: "Access report cover note",
    category: "REQUEST_UPDATE",
    subject: "Your personal data access report ({{reference}})",
    bodyMarkdown: [
      "Dear {{principal_name}},",
      "",
      "Attached is the personal data access report {{company_name}} has prepared in response to your request, reference **{{reference}}**, request type **{{request_type}}**.",
      "",
      "View it any time in your portal: {{portal_link}}",
      "",
      "Questions about this report? Contact {{contact_email}} or our Data Protection Officer, {{dpo_name}} ({{dpo_contact}}).",
    ].join("\n"),
    requiredVariables: [
      "principal_name",
      "company_name",
      "reference",
      "request_type",
      "portal_link",
      "dpo_name",
      "dpo_contact",
    ],
  },
];

if (SYSTEM_MESSAGE_TEMPLATES.length !== 15) {
  throw new Error(
    `SYSTEM_MESSAGE_TEMPLATES must have exactly 15 entries per spec lines ` +
      `775-780; found ${SYSTEM_MESSAGE_TEMPLATES.length}.`,
  );
}

/**
 * Idempotently upserts all fifteen system templates for `organizationId`,
 * keyed on the natural `[organizationId, code, version]` uniqueness (via
 * `code` + the fixed `version: 1` this seed always writes -- a
 * subsequent run re-applies the current definition rather than creating
 * a second row or bumping the version, matching `seedPermissions`'s
 * upsert-by-natural-key idempotency).
 *
 * `variables` is derived from the actual text via
 * `extractTemplateVariables` rather than trusted from
 * `SYSTEM_MESSAGE_TEMPLATES` -- this also re-verifies, on every seed run,
 * that no template text has drifted outside the closed whitelist.
 */
export async function seedMessageTemplates(
  prisma: PrismaService,
  organizationId: string,
): Promise<void> {
  for (const def of SYSTEM_MESSAGE_TEMPLATES) {
    const subjectVars = extractTemplateVariables(def.subject);
    const bodyVars = extractTemplateVariables(def.bodyMarkdown);
    const variables = [...new Set([...subjectVars, ...bodyVars])];

    await prisma.messageTemplate.upsert({
      where: {
        organizationId_code_version: {
          organizationId,
          code: def.code,
          version: 1,
        },
      },
      create: {
        organizationId,
        code: def.code,
        name: def.name,
        category: def.category,
        subject: def.subject,
        bodyMarkdown: def.bodyMarkdown,
        variables,
        requiredVariables: [...def.requiredVariables],
        isSystem: true,
        version: 1,
      },
      update: {
        name: def.name,
        category: def.category,
        subject: def.subject,
        bodyMarkdown: def.bodyMarkdown,
        variables,
        requiredVariables: [...def.requiredVariables],
        isSystem: true,
      },
    });
  }
}
