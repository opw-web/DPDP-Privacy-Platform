import { MaskingService, CAN_VIEW_ALL_PERSONAL_DATA } from "./masking.service";

/**
 * Task 7 unit gate. `MaskingService` has no dependencies -- these are
 * pure-function tests, exercising exactly the cases the task brief names:
 * the two spec-exact examples (line 716), short local parts, short
 * domains, missing values, and non-string input, plus the
 * permission-gated `maskIfNeeded` dispatch (ADMIN-shaped vs
 * AUDITOR-shaped permission sets on the SAME field/value, so a passing
 * "masked" assertion can be directly compared against a passing
 * "unmasked" assertion in the same test -- the brief's "on the same
 * field of the same record" requirement, done here at the unit level
 * since no HTTP route yet serves personal data (Tasks 20-21 land that)).
 */
describe("MaskingService", () => {
  const masking = new MaskingService();

  describe("maskEmail", () => {
    it("matches the spec example exactly (line 716)", () => {
      expect(masking.maskEmail("aman@gmail.com")).toBe("am**@gm***.com");
    });

    it("masks a short local part (2 characters) without revealing more than one character", () => {
      // "ab" -> keep=min(2, len-1)=1 -> "a*"
      expect(masking.maskEmail("ab@example.com")).toBe("a*@ex*****.com");
    });

    it("masks a single-character local part entirely", () => {
      expect(masking.maskEmail("a@example.com")).toBe("*@ex*****.com");
    });

    it("masks a short domain label (1 character) without revealing it", () => {
      expect(masking.maskEmail("someone@a.co")).toBe("so*****@*.co");
    });

    it("masks a short domain label (2 characters)", () => {
      expect(masking.maskEmail("someone@ab.io")).toBe("so*****@a*.io");
    });

    it("still masks something for a string with no @ at all", () => {
      const result = masking.maskEmail("not-an-email");
      expect(result).not.toBe("not-an-email");
      expect(typeof result).toBe("string");
    });

    it("passes through null, undefined and empty string unchanged, without throwing", () => {
      expect(masking.maskEmail(null)).toBeNull();
      expect(masking.maskEmail(undefined)).toBeUndefined();
      expect(masking.maskEmail("")).toBe("");
    });

    it("passes through non-string input unchanged, without throwing", () => {
      // Cast to simulate an `any`-typed/bad-data call site slipping past
      // the type system -- Task 7 review Important 2 narrowed the public
      // signature to `string | null | undefined`, but the runtime guard
      // must still defend against this.
      expect(masking.maskEmail(12345 as unknown as string)).toBe(12345);
      expect(masking.maskEmail(true as unknown as string)).toBe(true);
      expect(
        masking.maskEmail({ email: "aman@gmail.com" } as unknown as string),
      ).toEqual({ email: "aman@gmail.com" });
    });
  });

  describe("maskPhone", () => {
    it("matches the spec example exactly (line 716)", () => {
      expect(masking.maskPhone("+919876543210")).toBe("+91 98****3210");
    });

    it("masks a 10-digit number with no country code", () => {
      expect(masking.maskPhone("9876543210")).toBe("98****3210");
    });

    it("tolerates an already-spaced input the same way", () => {
      expect(masking.maskPhone("+91 9876543210")).toBe("+91 98****3210");
    });

    it("masks a short number (<=6 digits) with a short-prefix fallback instead of throwing or fully exposing it", () => {
      const result = masking.maskPhone("12345");
      expect(result).toBe("12***");
      expect(result).not.toBe("12345");
    });

    it("passes through null, undefined and empty string unchanged, without throwing", () => {
      expect(masking.maskPhone(null)).toBeNull();
      expect(masking.maskPhone(undefined)).toBeUndefined();
      expect(masking.maskPhone("")).toBe("");
    });

    it("passes through non-string input unchanged, without throwing", () => {
      // Same defensive-cast rationale as maskEmail's equivalent test.
      expect(masking.maskPhone(9876543210 as unknown as string)).toBe(
        9876543210,
      );
      expect(masking.maskPhone(false as unknown as string)).toBe(false);
      expect(masking.maskPhone(["+919876543210"] as unknown as string)).toEqual(
        ["+919876543210"],
      );
    });

    it("passes through a string with no digits unchanged", () => {
      expect(masking.maskPhone("not-a-phone")).toBe("not-a-phone");
    });
  });

  describe("maskValue", () => {
    it("dispatches EMAIL to maskEmail and PHONE to maskPhone", () => {
      expect(masking.maskValue("EMAIL", "aman@gmail.com")).toBe(
        "am**@gm***.com",
      );
      expect(masking.maskValue("PHONE", "+919876543210")).toBe(
        "+91 98****3210",
      );
    });

    // Task 7 review Important 1: masking must fail CLOSED. A canonical
    // field with no spec-defined format (everything but EMAIL/PHONE) is
    // masked generically, NOT passed through unmasked -- these two used
    // to pass through before the fix; they must now come back masked.
    it("masks every canonical field with no spec-defined format, generically, rather than passing it through unmasked", () => {
      expect(masking.maskValue("FULL_NAME", "Aman Gupta")).toBe("Am********");
      expect(masking.maskValue("DATE_OF_BIRTH", "1990-01-01")).toBe(
        "19********",
      );
      expect(masking.maskValue("FULL_NAME", "Aman Gupta")).not.toBe(
        "Aman Gupta",
      );
    });

    // The short, explicit, commented allowlist -- judged genuinely NOT
    // personal data -- is the only thing exempt from the fail-closed
    // default above.
    it("passes through the explicit PASS_THROUGH_FIELDS allowlist unchanged", () => {
      expect(masking.maskValue("ACCOUNT_STATUS", "active")).toBe("active");
      expect(masking.maskValue("EXTERNAL_ID", "ext-12345")).toBe("ext-12345");
      expect(masking.maskValue("IGNORE", "whatever")).toBe("whatever");
    });

    it("masks CUSTOMER_ID because it identifies the data principal", () => {
      expect(masking.maskValue("CUSTOMER_ID", "cust-98765")).toBe("cu******65");
      expect(masking.maskValue("CUSTOMER_ID", "cust-98765")).not.toBe(
        "cust-98765",
      );
    });

    // Proves the fail-closed default holds even for a canonical field
    // that exists in NEITHER special-case list -- including one that
    // does not exist in the `CanonicalField` enum yet. A field added to
    // the enum later with no masking rule of its own must come back
    // masked by default, not unmasked, per Important 1's exact
    // "AADHAAR_NUMBER" example.
    it("masks a hypothetical canonical field in neither the EMAIL/PHONE nor the PASS_THROUGH_FIELDS list", () => {
      const result = masking.maskValue("AADHAAR_NUMBER", "123456789012");
      expect(result).not.toBe("123456789012");
      expect(typeof result).toBe("string");
    });
  });

  describe("maskIfNeeded", () => {
    // Positive control (ADMIN-shaped) and negative case (AUDITOR-shaped)
    // asserted together, on the identical field and value -- exactly the
    // brief's "assert ADMIN sees the real value and AUDITOR sees the
    // masked one, on the same field of the same record" requirement.
    const email = "aman@gmail.com";
    const adminPermissions = new Set([
      "CAN_VIEW_PRINCIPALS",
      CAN_VIEW_ALL_PERSONAL_DATA,
    ]);
    const auditorPermissions = new Set(["CAN_VIEW_PRINCIPALS"]);

    it("returns the real value for an actor holding CAN_VIEW_ALL_PERSONAL_DATA", () => {
      expect(masking.maskIfNeeded(adminPermissions, "EMAIL", email)).toBe(
        email,
      );
    });

    it("returns the masked value for an actor holding CAN_VIEW_PRINCIPALS without CAN_VIEW_ALL_PERSONAL_DATA", () => {
      expect(masking.maskIfNeeded(auditorPermissions, "EMAIL", email)).toBe(
        "am**@gm***.com",
      );
    });

    it("accepts a plain array of permission codes, not just a Set", () => {
      expect(
        masking.maskIfNeeded(["CAN_VIEW_PRINCIPALS"], "EMAIL", email),
      ).toBe("am**@gm***.com");
      expect(
        masking.maskIfNeeded(
          ["CAN_VIEW_PRINCIPALS", CAN_VIEW_ALL_PERSONAL_DATA],
          "EMAIL",
          email,
        ),
      ).toBe(email);
    });

    it("masks with no permissions at all, without throwing", () => {
      expect(masking.maskIfNeeded(new Set(), "EMAIL", email)).toBe(
        "am**@gm***.com",
      );
    });
  });
});
