import { DateTime } from "../../components/shared/DateTime";
import { SourceChip } from "../../components/shared/SourceChip";
import { Card, CardContent } from "../../components/ui/card";

/**
 * Plain-language labels for `CanonicalField` (`prisma/schema.prisma`).
 * This portal is read by members of the public, not compliance staff, so
 * a value's field name is never shown as its raw enum spelling.
 */
const FIELD_LABELS: Record<string, string> = {
  FULL_NAME: "Full name",
  FIRST_NAME: "First name",
  LAST_NAME: "Last name",
  EMAIL: "Email address",
  PHONE: "Phone number",
  DATE_OF_BIRTH: "Date of birth",
  GENDER: "Gender",
  ADDRESS_LINE1: "Address",
  ADDRESS_LINE2: "Address (continued)",
  CITY: "City",
  STATE: "State",
  POSTAL_CODE: "Postal code",
  COUNTRY: "Country",
  CUSTOMER_ID: "Customer ID",
  ACCOUNT_STATUS: "Account status",
  LAST_ACTIVITY_AT: "Last activity",
  PURCHASE_TOTAL: "Total purchases",
  EXTERNAL_ID: "Reference ID",
};

/** Falls back to a humanized version of the raw code for any field this map has not been taught yet -- never a raw SNAKE_CASE string on screen. */
function fieldLabel(canonicalField: string): string {
  const known = FIELD_LABELS[canonicalField];
  if (known) return known;
  return canonicalField
    .toLowerCase()
    .split("_")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export interface ValueCardSource {
  id: string;
  name: string;
}

export interface ValueCardProps {
  canonicalField: string;
  value: string;
  /** The systems that hold this value. Rendered as "Held in: ...". */
  sources: readonly ValueCardSource[];
  /**
   * The purposes this value is used for, or the single sentinel string
   * "Purpose not configured" when none of its sources has a purpose
   * attached. Never a guessed or default purpose (spec/Check 11) -- this
   * component only renders what it is given, it never invents a fallback
   * of its own beyond that exact string.
   */
  purposes: readonly string[];
  updatedAt?: string;
}

/**
 * One held value in `/me/data`: the value itself, which systems hold it
 * ("Held in: Marketing Database, Sales CRM") and what it is used for
 * ("Used for: Customer Support, Order Fulfilment", or "Purpose not
 * configured"). Every value on this page renders through this component
 * so the two lines can never be forgotten for one entry but not another.
 */
export function ValueCard({ canonicalField, value, sources, purposes, updatedAt }: ValueCardProps) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium text-muted-foreground">{fieldLabel(canonicalField)}</p>
          {updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Last updated <DateTime value={updatedAt} />
            </p>
          ) : null}
        </div>
        <p className="text-lg">{value}</p>
        <p className="text-sm text-muted-foreground">
          Held in:{" "}
          {sources.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-1 align-middle">
              {sources.map((source) => (
                <SourceChip key={source.id} label={source.name} />
              ))}
            </span>
          ) : (
            "Not known"
          )}
        </p>
        <p className="text-sm text-muted-foreground">Used for: {purposes.join(", ")}</p>
      </CardContent>
    </Card>
  );
}
