import * as argon2 from "argon2";

/**
 * A hash of a fixed, never-used password, computed once on first use and
 * cached. When a login attempt names an identifier (email) that matches
 * no account anywhere, the caller still runs `argon2.verify` against this
 * dummy hash before responding -- so an unknown identifier and a known
 * identifier with a wrong password take roughly the same amount of work,
 * and the HTTP response (401, identical body) is identical either way.
 * This is the "must not reveal whether the account exists" requirement:
 * the leak vector is the response and its timing, not the audit log.
 *
 * Shared by `EmployeeAuthService` and `PrincipalAuthService` (task 6):
 * one dummy hash, one cache, so the two login paths cannot drift into
 * subtly different timing profiles.
 */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash("not-a-real-password-used-only-for-timing", {
    type: argon2.argon2id,
  });
  return dummyHash;
}
