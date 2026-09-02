import { describe, expect, it } from "vitest";
import {
  BREACH_NOTIFICATION_PLACEHOLDER_ELEMENTS,
  missingBreachPlaceholders,
  missingPlaceholdersKey,
} from "./breach-notification-elements";

// The seeded BREACH_NOTIFICATION template body (prisma/seed/message-templates.ts),
// reproduced verbatim enough to exercise the real placeholder names.
const SEEDED_SUBJECT = "Important: personal data breach notice ({{breach_reference}})";
const SEEDED_BODY = [
  "Dear {{principal_name}},",
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
].join("\n");

describe("breach notification placeholder elements", () => {
  it("names exactly six elements, matching the backend's BREACH_NOTIFICATION_REQUIRED_ELEMENTS whitelist", () => {
    expect(BREACH_NOTIFICATION_PLACEHOLDER_ELEMENTS.map((e) => e.token)).toEqual([
      "{{breach_reference}}",
      "{{breach_nature_extent_timing}}",
      "{{breach_consequences}}",
      "{{breach_mitigation}}",
      "{{breach_safety_measures}}",
      "{{breach_responder_contact}}",
    ]);
  });

  it("finds nothing missing in the real seeded BREACH_NOTIFICATION template", () => {
    expect(missingBreachPlaceholders(SEEDED_SUBJECT, SEEDED_BODY)).toEqual([]);
  });

  it("finds a placeholder that appears only in the subject, not just the body", () => {
    // breach_reference lives in the subject line of the real seed; a
    // body-only check (the pre-existing, now-replaced bug) would have
    // wrongly reported it missing.
    const missing = missingBreachPlaceholders(SEEDED_SUBJECT, "no breach placeholders here at all");
    expect(missing.map((m) => m.token)).not.toContain("{{breach_reference}}");
  });

  it("reports every element missing from a blank subject and body", () => {
    expect(missingBreachPlaceholders("", "")).toHaveLength(6);
  });

  it("reports exactly the placeholders removed from an otherwise-complete body", () => {
    const withoutSafetyAndContact = SEEDED_BODY.replace("{{breach_safety_measures}}", "").replace(
      "{{breach_responder_contact}}",
      "",
    );
    const missing = missingBreachPlaceholders(SEEDED_SUBJECT, withoutSafetyAndContact);
    expect(missing.map((m) => m.token)).toEqual(["{{breach_safety_measures}}", "{{breach_responder_contact}}"]);
  });

  it("keys the same missing set identically regardless of instance, so a stale acknowledgement can be detected by comparing keys", () => {
    const a = missingBreachPlaceholders("", "");
    const b = missingBreachPlaceholders("", "");
    expect(missingPlaceholdersKey(a)).toBe(missingPlaceholdersKey(b));
  });

  it("changes key when a different element becomes missing, so an earlier acknowledgement cannot silently cover it", () => {
    const beforeKey = missingPlaceholdersKey(
      missingBreachPlaceholders(SEEDED_SUBJECT, SEEDED_BODY.replace("{{breach_safety_measures}}", "")),
    );
    const afterKey = missingPlaceholdersKey(
      missingBreachPlaceholders(
        SEEDED_SUBJECT,
        SEEDED_BODY.replace("{{breach_safety_measures}}", "").replace("{{breach_responder_contact}}", ""),
      ),
    );
    expect(afterKey).not.toBe(beforeKey);
  });
});
