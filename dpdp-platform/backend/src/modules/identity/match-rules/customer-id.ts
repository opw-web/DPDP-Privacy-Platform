import type { NormalizationMapping } from "../../normalization/normalization.service";
import type { MatchSignal } from "../matching.service";

/**
 * Normalization processes mappings by source-field/canonical-field order and
 * ignores subsequent entries for a source field. Matching cannot recover the
 * source field which populated NormalizedRecord.customerId, so it must fail
 * closed unless there is one unambiguous, effective CUSTOMER_ID mapping.
 *
 * Counting every CUSTOMER_ID mapping is intentional: a second source field
 * can lose NormalizationService's canonical-field collision today, but that
 * fact is not stored on NormalizedRecord and therefore cannot safely prove
 * provenance later. This also makes malformed duplicate mapping input safe.
 */
function hasSoleVerifiedCustomerIdMapping(
  mappings: readonly NormalizationMapping[],
): boolean {
  const sorted = [...mappings].sort(
    (left, right) =>
      left.sourceField.localeCompare(right.sourceField) ||
      left.canonicalField.localeCompare(right.canonicalField),
  );
  const seenSourceFields = new Set<string>();
  const effectiveMappings: NormalizationMapping[] = [];
  for (const mapping of sorted) {
    if (seenSourceFields.has(mapping.sourceField)) {
      continue;
    }
    seenSourceFields.add(mapping.sourceField);
    effectiveMappings.push(mapping);
  }

  const customerIdMappings = mappings.filter(
    (mapping) => mapping.canonicalField === "CUSTOMER_ID",
  );
  const effectiveCustomerIdMappings = effectiveMappings.filter(
    (mapping) => mapping.canonicalField === "CUSTOMER_ID",
  );
  return (
    customerIdMappings.length === 1 &&
    effectiveCustomerIdMappings.length === 1 &&
    effectiveCustomerIdMappings[0]?.isVerifiedCustomerId === true
  );
}

export function verifiedCustomerIdValue(
  customerId: string | null,
  mappings: readonly NormalizationMapping[],
): string | null {
  return customerId && hasSoleVerifiedCustomerIdMapping(mappings)
    ? customerId
    : null;
}

/** Rule 1: an exact customer identifier is trusted only when its source
 * mapping explicitly marks it as verified. */
export function customerIdSignal(
  customerId: string | null,
  mappings: readonly NormalizationMapping[],
): MatchSignal | null {
  const verifiedCustomerId = verifiedCustomerIdValue(customerId, mappings);

  return verifiedCustomerId
    ? {
        rule: "CUSTOMER_ID",
        identifierType: "CUSTOMER_ID",
        value: verifiedCustomerId,
        confidence: "EXACT",
        order: 1,
      }
    : null;
}
