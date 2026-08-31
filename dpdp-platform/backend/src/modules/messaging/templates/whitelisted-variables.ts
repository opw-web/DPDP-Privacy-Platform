/**
 * The CLOSED variable whitelist for message templates, transcribed
 * verbatim from the fenced block at DPDP_MVP2_COMPLIANCE_OPERATIONS.md
 * lines 785-790.
 *
 * FIDELITY NOTE: the task brief's prose says "24 whitelisted variables";
 * the fenced block itself lists exactly 23 distinct `{{name}}` tokens.
 * This mirrors the 35-vs-33 (MVP 1 audit actions), 22-vs-23 (MVP 1
 * permissions) and 17-vs-19 (MVP 2 task 1 enums) discrepancies already
 * flagged elsewhere in this project -- per the same house rule, this
 * array is transcribed exactly from the block, not padded to match the
 * brief's prose count.
 *
 * This is the ONLY list `template-renderer.ts` will ever substitute --
 * any `{{...}}` reference outside this set throws
 * `UnknownTemplateVariableError` rather than being silently dropped or
 * rendered empty (spec line 72 / line 1054: an unwhitelisted variable is
 * exactly how a template author injects script into a notice sent to
 * thousands of people; a blank is exactly how a legal disclosure goes
 * missing without anyone noticing).
 */
export const TEMPLATE_VARIABLE_WHITELIST = [
  "principal_name",
  "company_name",
  "reference",
  "request_type",
  "due_date",
  "published_grievance_period",
  "breach_reference",
  "breach_nature_extent_timing",
  "breach_consequences",
  "breach_mitigation",
  "breach_safety_measures",
  "breach_responder_contact",
  "data_categories",
  "purpose_name",
  "notice_version",
  "withdrawal_url",
  "rights_url",
  "board_complaint_url",
  "dpo_name",
  "dpo_contact",
  "contact_email",
  "portal_link",
  "erasure_date",
] as const;

/** True count of the fenced block: 23, not the brief prose's 24. */
export const TEMPLATE_VARIABLE_WHITELIST_COUNT =
  TEMPLATE_VARIABLE_WHITELIST.length;

export type TemplateVariableName = (typeof TEMPLATE_VARIABLE_WHITELIST)[number];

const WHITELIST_SET: ReadonlySet<string> = new Set(TEMPLATE_VARIABLE_WHITELIST);

export function isWhitelistedTemplateVariable(
  name: string,
): name is TemplateVariableName {
  return WHITELIST_SET.has(name);
}

/**
 * The six placeholders `BREACH_NOTIFICATION` (and any other
 * `BREACH_NOTICE`-category template) must retain by default: the five
 * Rule 7(1) narrative elements plus the breach reference, per spec
 * lines 787-788. Removing any one of these on PATCH must warn loudly,
 * naming the missing element, and requires an explicit
 * `acknowledgeBreachElementRemoval: true` before the edit is applied
 * (see `templates.service.ts`).
 */
export const BREACH_NOTIFICATION_REQUIRED_ELEMENTS: readonly TemplateVariableName[] =
  [
    "breach_reference",
    "breach_nature_extent_timing",
    "breach_consequences",
    "breach_mitigation",
    "breach_safety_measures",
    "breach_responder_contact",
  ];
