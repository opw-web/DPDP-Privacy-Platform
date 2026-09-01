export type GuardianKind = "PARENT_OF_CHILD" | "LAWFUL_GUARDIAN_OF_PWD";

export type GuardianVerification =
  | "NONE"
  | "EXISTING_RELIABLE_DETAILS"
  | "SELF_PROVIDED_DETAILS"
  | "VIRTUAL_TOKEN"
  | "DIGITAL_LOCKER"
  | "COURT_ORDER"
  | "DESIGNATED_AUTHORITY"
  | "LOCAL_LEVEL_COMMITTEE";

export interface GuardianRelationship {
  id: string;
  dataPrincipalId: string;
  kind: GuardianKind;
  guardianName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  verification: GuardianVerification;
  verificationReference: string | null;
  verifiedByEmployeeId: string | null;
  verifiedAt: string | null;
  appointingAuthority: string | null;
  appointmentReference: string | null;
  active: boolean;
  createdAt: string;
}

export const VERIFICATION_METHODS: readonly { value: GuardianVerification; label: string }[] = [
  { value: "EXISTING_RELIABLE_DETAILS", label: "Reliable identity and age details already held" },
  { value: "SELF_PROVIDED_DETAILS", label: "Details voluntarily provided" },
  { value: "VIRTUAL_TOKEN", label: "Virtual token from an authorised entity" },
  { value: "DIGITAL_LOCKER", label: "Digital Locker reference" },
  { value: "COURT_ORDER", label: "Court order" },
  { value: "DESIGNATED_AUTHORITY", label: "Designated authority" },
  { value: "LOCAL_LEVEL_COMMITTEE", label: "Local Level Committee" },
];

export function guardianVerificationLabel(value: GuardianVerification): string {
  if (value === "NONE") return "Not verified";
  return VERIFICATION_METHODS.find((method) => method.value === value)?.label ?? value;
}

/** Rule 10: only active guardians with a recorded verification method can give consent. */
export function isGuardianConsentEligible(guardian: GuardianRelationship): boolean {
  return guardian.active && guardian.verification !== "NONE";
}
