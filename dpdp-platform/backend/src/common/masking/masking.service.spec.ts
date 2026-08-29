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
      expect(masking.maskEmail(12345)).toBe(12345);
      expect(masking.maskEmail(true)).toBe(true);
      expect(masking.maskEmail({ email: "aman@gmail.com" })).toEqual({
        email: "aman@gmail.com",
      });
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
      expect(masking.maskPhone(9876543210)).toBe(9876543210);
      expect(masking.maskPhone(false)).toBe(false);
      expect(masking.maskPhone(["+919876543210"])).toEqual(["+919876543210"]);
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

    it("passes every other canonical field through unchanged -- no spec-defined mask exists for it", () => {
      expect(masking.maskValue("FULL_NAME", "Aman Gupta")).toBe("Aman Gupta");
      expect(masking.maskValue("DATE_OF_BIRTH", "1990-01-01")).toBe(
        "1990-01-01",
      );
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
