/**
 * Rule 11's closed set of bodies that may appoint a lawful guardian for a
 * person with disability. `GuardianRelationship.appointingAuthority` is a
 * plain `String?` column in the schema (not a Prisma enum -- see the
 * model's own comment: `// COURT | DESIGNATED_AUTHORITY |
 * LOCAL_LEVEL_COMMITTEE`), so this is the one place the closed set is
 * spelled out. Both `CreateGuardianDto` (pipe-layer `@IsIn`) and
 * `GuardiansService.assertPwdAppointmentValid` (the authoritative,
 * un-bypassable check) import this SAME array rather than each hard-coding
 * their own copy that could drift.
 */
export const APPOINTING_AUTHORITIES = [
  "COURT",
  "DESIGNATED_AUTHORITY",
  "LOCAL_LEVEL_COMMITTEE",
] as const;

export type AppointingAuthority = (typeof APPOINTING_AUTHORITIES)[number];
