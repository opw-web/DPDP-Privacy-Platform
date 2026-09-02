/**
 * The six Rule 7(1) / breach-reference placeholders a `BREACH_NOTICE`
 * template or campaign body must reference, mirrored from the backend's
 * closed whitelist (`whitelisted-variables.ts`,
 * `BREACH_NOTIFICATION_REQUIRED_ELEMENTS`):
 *   breach_reference, breach_nature_extent_timing, breach_consequences,
 *   breach_mitigation, breach_safety_measures, breach_responder_contact.
 *
 * This is the ONE place this frontend defines that list -- both the
 * template editor (`MessagingTemplateEditorPage`) and the campaign
 * builder (`MessagingCampaignBuilderPage`) import it rather than keeping
 * their own copy, so the two safeguards can never drift out of sync with
 * each other the way an earlier, template-editor-only copy of this list
 * had drifted out of sync with the actual backend whitelist (it checked
 * for `{{breach_description}}`, `{{occurred_at}}`, `{{likely_consequences}}`,
 * `{{measures_taken}}`, `{{responder_contact}}` -- none of which are real
 * template variables, so that check could never correctly pass OR
 * correctly fail).
 */
export const BREACH_NOTIFICATION_PLACEHOLDER_ELEMENTS: ReadonlyArray<{
  token: string;
  label: string;
}> = [
  { token: "{{breach_reference}}", label: "Breach reference" },
  { token: "{{breach_nature_extent_timing}}", label: "Nature, extent and timing of the breach" },
  { token: "{{breach_consequences}}", label: "Consequences likely to affect the data principal" },
  { token: "{{breach_mitigation}}", label: "Mitigation measures implemented and being implemented" },
  { token: "{{breach_safety_measures}}", label: "Safety measures the data principal may take" },
  { token: "{{breach_responder_contact}}", label: "Business/responder contact information" },
];

/**
 * Which of the six elements are NOT referenced by the given subject/body.
 * Checks both, not body alone -- the seeded `BREACH_NOTIFICATION` template
 * places `{{breach_reference}}` in its subject line as well as its body,
 * and the backend's own renderer/removal-detection scans subject and body
 * together (`extractAndValidateVariables`, `template-renderer.ts`). A
 * body-only check would miss a placeholder dropped from the subject.
 */
export function missingBreachPlaceholders(
  subject: string,
  body: string,
): Array<{ token: string; label: string }> {
  const haystack = `${subject}\n${body}`;
  return BREACH_NOTIFICATION_PLACEHOLDER_ELEMENTS.filter(
    (element) => !haystack.includes(element.token),
  );
}

/**
 * A stable key for "the current set of missing elements", used to detect
 * when an operator's earlier acknowledgement has gone stale because the
 * body was edited again afterwards (e.g. ticked the box for one missing
 * element, then removed a second, different one). Compare this against
 * the key captured at the moment of acknowledgement rather than storing a
 * bare boolean -- a bare boolean, once true, would silently cover any
 * later, different omission too.
 */
export function missingPlaceholdersKey(missing: ReadonlyArray<{ token: string }>): string {
  return missing.map((element) => element.token).join(",");
}
