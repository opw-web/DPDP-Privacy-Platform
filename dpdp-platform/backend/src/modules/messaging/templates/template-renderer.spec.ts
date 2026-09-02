import {
  MissingRequiredVariableError,
  UnknownTemplateVariableError,
  renderMessageTemplate,
} from "./template-renderer";
import { BREACH_NOTIFICATION_REQUIRED_ELEMENTS } from "./whitelisted-variables";

/**
 * Regression gate for defect 3 (HIGH): a BREACH_NOTICE campaign built
 * with ad-hoc subject/body text (no `templateId`) got `requiredVariables:
 * []` -- nothing populated the DTO field -- so `renderMessageTemplate`'s
 * required-variable check never ran, and a breach record with NULL
 * Rule 7(1) narrative fields rendered and sent 114 legally defective
 * notices with no error anywhere.
 *
 * The fix: `renderMessageTemplate` now treats every one of the six
 * `BREACH_NOTIFICATION_REQUIRED_ELEMENTS` (§4.9) as required WHENEVER
 * the subject/body reference it, independent of what the caller's own
 * `requiredVariables` array says. No database, no Nest bootstrap --
 * `renderMessageTemplate` is a pure function.
 */
describe("renderMessageTemplate -- breach-element enforcement is independent of requiredVariables", () => {
  const BREACH_BODY = [
    "Reference: {{breach_reference}}",
    "Nature/extent/timing: {{breach_nature_extent_timing}}",
    "Consequences: {{breach_consequences}}",
    "Mitigation: {{breach_mitigation}}",
    "Safety measures: {{breach_safety_measures}}",
    "Contact: {{breach_responder_contact}}",
  ].join("\n");

  it("has exactly the six elements the spec names, sanity-checking the fixture against the real constant", () => {
    expect(BREACH_NOTIFICATION_REQUIRED_ELEMENTS).toHaveLength(6);
  });

  it.each(BREACH_NOTIFICATION_REQUIRED_ELEMENTS)(
    "throws MissingRequiredVariableError naming %s when the template declares it but requiredVariables is empty (the ad-hoc-campaign incident)",
    (missing) => {
      const variables = Object.fromEntries(
        BREACH_NOTIFICATION_REQUIRED_ELEMENTS.filter((v) => v !== missing).map(
          (v) => [v, `value for ${v}`],
        ),
      );
      expect(() =>
        renderMessageTemplate({
          subjectSource: "Breach notice",
          bodySource: BREACH_BODY,
          variables,
          // The exact shape the ad-hoc campaign-builder payload produced:
          // no requiredVariables at all.
          requiredVariables: [],
        }),
      ).toThrow(MissingRequiredVariableError);

      try {
        renderMessageTemplate({
          subjectSource: "Breach notice",
          bodySource: BREACH_BODY,
          variables,
          requiredVariables: [],
        });
        throw new Error("expected renderMessageTemplate to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(MissingRequiredVariableError);
        // The operator must learn WHICH element was missing, not just
        // that "render failed".
        expect((err as MissingRequiredVariableError).variableName).toBe(missing);
        expect((err as Error).message).toContain(missing);
      }
    },
  );

  it("also fails when the value is present but whitespace-only", () => {
    const variables = Object.fromEntries(
      BREACH_NOTIFICATION_REQUIRED_ELEMENTS.map((v) => [v, `value for ${v}`]),
    );
    variables.breach_consequences = "   ";
    expect(() =>
      renderMessageTemplate({
        subjectSource: "Breach notice",
        bodySource: BREACH_BODY,
        variables,
        requiredVariables: [],
      }),
    ).toThrow(/breach_consequences/);
  });

  it("renders successfully once every declared breach element has a real value (positive control)", () => {
    const variables = Object.fromEntries(
      BREACH_NOTIFICATION_REQUIRED_ELEMENTS.map((v) => [v, `${v}-value`]),
    );
    const result = renderMessageTemplate({
      subjectSource: "Breach notice",
      bodySource: BREACH_BODY,
      variables,
      requiredVariables: [],
    });
    for (const v of BREACH_NOTIFICATION_REQUIRED_ELEMENTS) {
      expect(result.body).toContain(`${v}-value`);
    }
  });

  it("does NOT widen to 'every referenced variable is required' -- a non-breach variable outside requiredVariables still renders blank", () => {
    const result = renderMessageTemplate({
      subjectSource: "Hi {{principal_name}}",
      bodySource: "Dear {{principal_name}}, your portal link: {{portal_link}}.",
      variables: { principal_name: "Priya" },
      requiredVariables: ["principal_name"],
    });
    expect(result.body).toBe("Dear Priya, your portal link: .");
  });

  it("still throws UnknownTemplateVariableError before any required-variable check, for a syntax/whitelist violation", () => {
    expect(() =>
      renderMessageTemplate({
        subjectSource: "Hi",
        bodySource: "{{not_a_real_variable}}",
        variables: {},
        requiredVariables: [],
      }),
    ).toThrow(UnknownTemplateVariableError);
  });
});
