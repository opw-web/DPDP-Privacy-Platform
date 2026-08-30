import type { NormalizationMapping } from "../../normalization/normalization.service";
import type { MatchSignal } from "../matching.service";

/** Rule 1: an exact customer identifier is trusted only when its source
 * mapping explicitly marks it as verified. */
export function customerIdSignal(
  customerId: string | null,
  mappings: readonly NormalizationMapping[],
): MatchSignal | null {
  const isVerified = mappings.some(
    (mapping) =>
      mapping.canonicalField === "CUSTOMER_ID" &&
      mapping.isVerifiedCustomerId === true,
  );

  return customerId && isVerified
    ? {
        rule: "CUSTOMER_ID",
        identifierType: "CUSTOMER_ID",
        value: customerId,
        confidence: "EXACT",
        order: 1,
      }
    : null;
}
