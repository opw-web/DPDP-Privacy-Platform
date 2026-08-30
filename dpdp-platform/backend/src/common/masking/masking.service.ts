import { Injectable } from "@nestjs/common";
import type { CanonicalField } from "@prisma/client";

/** The one permission code that lifts masking (spec line 716, SE-01). */
export const CAN_VIEW_ALL_PERSONAL_DATA = "CAN_VIEW_ALL_PERSONAL_DATA";

/**
 * `CanonicalField` values judged genuinely NOT personal data, and so
 * deliberately exempt from masking rather than falling through the
 * generic fallback below. Kept as a short, explicit, commented allowlist
 * -- not a "everything not EMAIL/PHONE" default -- per Task 7 review
 * Important 1: the enum is open (a future canonical field like
 * `AADHAAR_NUMBER` can be added to it at any time), so the safe posture
 * is failing CLOSED (mask by default) with an explicit opt-out list, not
 * failing OPEN (pass through by default) with an implicit allowlist nothing
 * enforces.
 */
const PASS_THROUGH_FIELDS: ReadonlySet<string> = new Set([
  "ACCOUNT_STATUS", // operational status (e.g. "active"/"churned"), not personal data
  "EXTERNAL_ID", // opaque source-system identifier, not itself personal data
  "CUSTOMER_ID", // ditto -- an identifier, not a personal-data value
  "IGNORE", // canonical marker meaning "field mapping intentionally dropped"; never a real value
]);

/**
 * Masks personal-data VALUES before they leave the process. SE-01: an
 * actor holding `CAN_VIEW_PRINCIPALS` without `CAN_VIEW_ALL_PERSONAL_DATA`
 * (the AUDITOR role, by seeded default) must never receive an unmasked
 * personal-data value in an API response -- not "the frontend hides it,"
 * an actual different, already-redacted string leaves this process.
 * There is no server-rendered path and no React component in this
 * codebase that ever sees the real value for such an actor: masking
 * happens here, in the service layer that builds the response, never in
 * the browser.
 *
 * Formats are transcribed exactly from spec line 716:
 *   maskEmail("aman@gmail.com")     -> "am**@gm***.com"
 *   maskPhone("+919876543210")      -> "+91 98****3210"
 *
 * Only `EMAIL` and `PHONE` have a spec-defined masked format (spec line
 * 716's one masking example). Every other `CanonicalField`, EXCEPT the
 * short, explicit `PASS_THROUGH_FIELDS` allowlist above, is masked
 * generically via `maskSegment` -- fail CLOSED, not open (Task 7 review
 * Important 1). Inventing a spec-shaped format for e.g. full name or
 * date of birth is still out of scope (same "don't invent what the spec
 * doesn't state" discipline as `audit-actions.ts` and
 * `prisma/seed/permissions.ts`), but leaving them unmasked entirely is
 * not: "what masked means for name/DOB/address" is recorded as a spec
 * gap for the spec owner, not answered by silently exempting those
 * fields from masking.
 */
@Injectable()
export class MaskingService {
  /**
   * `am**@gm***.com` from `aman@gmail.com`: keeps a short, non-identifying
   * prefix of the local part and of the domain's first label, masks the
   * rest of each with same-length asterisks, and leaves the domain's
   * suffix (`.com`, `.co.uk`, ...) fully visible -- exactly the spec
   * example, character for character.
   *
   * Typed `string | null | undefined -> string | null | undefined`
   * (Task 7 review Important 2) so the masking guarantee survives into a
   * response DTO without a cast at the call site -- a cast is exactly
   * where an unmasked value could be reintroduced by accident. The
   * runtime still defensively handles a non-string value that reaches
   * here despite the type (e.g. from an `any`-typed call site, or bad
   * data) by returning it unchanged rather than throwing.
   */
  maskEmail(value: string | null | undefined): string | null | undefined {
    if (typeof value !== "string" || value.length === 0) {
      return value;
    }
    const atIndex = value.lastIndexOf("@");
    if (atIndex === -1) {
      // Not a well-formed email -- still mask something rather than
      // leaking the raw string verbatim.
      return this.maskSegment(value);
    }
    const local = value.slice(0, atIndex);
    const domain = value.slice(atIndex + 1);
    return `${this.maskSegment(local)}@${this.maskDomain(domain)}`;
  }

  /**
   * `+91 98****3210` from `+919876543210`: the last 10 digits are treated
   * as the subscriber number (keep first 2, mask the middle, keep last
   * 4); anything beyond that is the country code, re-emitted as `+<cc> `.
   * A bare 10-digit number (no country code) is masked the same way with
   * no `+<cc> ` prefix. Short numbers (6 digits or fewer) fall back to a
   * shorter keep-prefix-only mask so they are not either fully exposed or
   * fully starred out.
   *
   * Typed `string | null | undefined -> string | null | undefined`, same
   * rationale as `maskEmail` (Task 7 review Important 2); defensively
   * returns a non-string value unchanged rather than throwing.
   */
  maskPhone(value: string | null | undefined): string | null | undefined {
    if (typeof value !== "string" || value.length === 0) {
      return value;
    }
    const digits = value.replace(/\D/g, "");
    if (digits.length === 0) {
      return value;
    }
    if (digits.length > 10) {
      const countryCodeLength = digits.length - 10;
      const countryCode = digits.slice(0, countryCodeLength);
      const subscriberNumber = digits.slice(countryCodeLength);
      return `+${countryCode} ${this.maskDigits(subscriberNumber)}`;
    }
    return this.maskDigits(digits);
  }

  /**
   * Dispatches to the right mask for a `PrincipalDataField.canonicalField`
   * value. `EMAIL`/`PHONE` use the spec-exact formats above;
   * `PASS_THROUGH_FIELDS` members are returned unchanged; every other
   * canonical field -- including any added to the enum later with no
   * masking rule of its own -- is masked generically via `maskSegment`
   * (fail CLOSED; Task 7 review Important 1).
   *
   * Typed `string | null | undefined -> string | null | undefined`
   * (Task 7 review Important 2).
   */
  maskValue(
    canonicalField: CanonicalField | string,
    value: string | null | undefined,
  ): string | null | undefined {
    switch (canonicalField) {
      case "EMAIL":
        return this.maskEmail(value);
      case "PHONE":
        return this.maskPhone(value);
      default:
        if (PASS_THROUGH_FIELDS.has(canonicalField)) {
          return value;
        }
        if (typeof value !== "string" || value.length === 0) {
          return value;
        }
        return this.maskSegment(value);
    }
  }

  /**
   * The one entry point a controller/service should actually call:
   * applies `maskValue` only when the actor's permission set lacks
   * `CAN_VIEW_ALL_PERSONAL_DATA` (SE-01). `actorPermissions` is expected
   * to be the same per-request-resolved set `PermissionsGuard` attaches
   * to the request (see `@CurrentActorPermissions()`) -- never a fresh
   * database read here, and never a role-name check.
   */
  maskIfNeeded(
    actorPermissions: ReadonlySet<string> | readonly string[],
    canonicalField: CanonicalField | string,
    value: string | null | undefined,
  ): string | null | undefined {
    const permissions =
      actorPermissions instanceof Set
        ? actorPermissions
        : new Set(actorPermissions);
    if (permissions.has(CAN_VIEW_ALL_PERSONAL_DATA)) {
      return value;
    }
    return this.maskValue(canonicalField, value);
  }

  /**
   * Keeps up to 2 leading characters, masks the rest with same-length
   * asterisks. For very short segments (length 1), keeps 0 and masks the
   * single character -- never reveals the whole thing, never keeps more
   * than it masks for a 1-2 character segment.
   */
  private maskSegment(segment: string, maxKeep = 2): string {
    const length = segment.length;
    if (length === 0) {
      return segment;
    }
    const keep = Math.min(maxKeep, Math.max(length - 1, 0));
    return segment.slice(0, keep) + "*".repeat(length - keep);
  }

  /** Masks only the domain's first label; the rest (`.com`, `.co.uk`, ...) is left visible. */
  private maskDomain(domain: string): string {
    const dotIndex = domain.indexOf(".");
    if (dotIndex === -1) {
      return this.maskSegment(domain);
    }
    const label = domain.slice(0, dotIndex);
    const suffix = domain.slice(dotIndex); // includes the leading "."
    return this.maskSegment(label) + suffix;
  }

  /** Keep first 2 / last 4 digits for a 7+ digit number; shorter numbers keep only a short prefix. */
  private maskDigits(digits: string): string {
    const length = digits.length;
    if (length <= 6) {
      return this.maskSegment(digits);
    }
    const keepStart = 2;
    const keepEnd = 4;
    const maskedLength = Math.max(length - keepStart - keepEnd, 0);
    return (
      digits.slice(0, keepStart) +
      "*".repeat(maskedLength) +
      digits.slice(length - keepEnd)
    );
  }
}
