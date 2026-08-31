export interface NormalizedName {
  display: string;
  nameKey: string;
}

function titleCase(value: string): string {
  return value
    .split(/(\s+)/u)
    .map((part) =>
      /^\s+$/u.test(part)
        ? part
        : part.charAt(0).toLocaleUpperCase() +
          part.slice(1).toLocaleLowerCase(),
    )
    .join("");
}

/** A presentation value plus a deliberately weak, order-insensitive signal. */
export function normalizeName(raw: unknown): NormalizedName {
  if (typeof raw !== "string") {
    return { display: "", nameKey: "" };
  }

  const collapsed = raw.trim().replace(/\s+/gu, " ");
  if (collapsed.length === 0) {
    return { display: "", nameKey: "" };
  }

  const tokens = collapsed
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((token) => token.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return { display: titleCase(collapsed), nameKey: tokens.join(" ") };
}
