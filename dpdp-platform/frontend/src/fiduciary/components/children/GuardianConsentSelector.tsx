import { guardianVerificationLabel, isGuardianConsentEligible, type GuardianRelationship } from "./types";

interface GuardianConsentSelectorProps {
  guardians: readonly GuardianRelationship[];
  value?: string;
  onChange?: (guardianId: string) => void;
  /** When set, only relationships for this child are consent-eligible. */
  childPrincipalId?: string;
  disabled?: boolean;
}

/**
 * A reusable consent-giver selector. Unverified and inactive relationships
 * remain visible for auditability, but are disabled so they cannot be used
 * for a child's consent (Rule 10).
 */
export function GuardianConsentSelector({
  guardians,
  value = "",
  onChange,
  childPrincipalId,
  disabled = false,
}: GuardianConsentSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="child-consent-guardian" className="text-sm font-medium">
        Guardian for child&apos;s consent
      </label>
      <select
        id="child-consent-guardian"
        aria-label="Guardian for child's consent"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">Select a verified guardian…</option>
        {guardians.map((guardian) => {
          const eligible = isGuardianConsentEligible(guardian) &&
            (!childPrincipalId || guardian.dataPrincipalId === childPrincipalId);
          return (
            <option key={guardian.id} value={guardian.id} disabled={!eligible}>
              {guardian.guardianName} — {guardianVerificationLabel(guardian.verification)}
              {!guardian.active ? " (inactive)" : guardian.dataPrincipalId !== childPrincipalId && childPrincipalId ? " (different child)" : !eligible ? " (cannot give consent)" : ""}
            </option>
          );
        })}
      </select>
      <p className="text-xs text-muted-foreground">
        Rule 10 requires an active, verified relationship. The platform records the method and
        reference; verification with DigiLocker, a court or another authority is out of scope.
      </p>
    </div>
  );
}
