import type { CanonicalField, DataCategory } from "@prisma/client";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";

/**
 * Distinguishes the two CN-02 warning shapes Ruling 2 requires the Task 24
 * UI to be able to tell apart, because they read very differently to a
 * DPO:
 *
 *  - `NO_PURPOSES_ATTACHED`: this source has zero purposes attached at
 *    all, so the necessary-category union is trivially empty and EVERY
 *    `containsPersonalData` mapping warns. This is legal (spec line
 *    746) -- the UI should say "no purpose configured yet", never imply
 *    the mapping itself is wrong.
 *  - `CATEGORY_OUTSIDE_PURPOSES`: at least one purpose IS attached, but
 *    none of them declares this mapping's `dataCategory` as necessary.
 *    This is the CN-02 minimisation signal proper -- the UI should name
 *    the field, the category, and the purposes that don't cover it.
 */
export type MappingWarningType =
  "NO_PURPOSES_ATTACHED" | "CATEGORY_OUTSIDE_PURPOSES";

export interface MappingWarningPurposeSummary {
  id: string;
  code: string;
  name: string;
  dataCategories: DataCategory[];
}

export interface MappingWarning {
  type: MappingWarningType;
  sourceField: string;
  canonicalField: CanonicalField;
  dataCategory: DataCategory;
  /** Every purpose currently attached to this source -- `[]` for `NO_PURPOSES_ATTACHED`. */
  attachedPurposes: MappingWarningPurposeSummary[];
  message: string;
}

/**
 * The narrow slice of `SourceFieldMapping` this check actually reads --
 * deliberately not `PublicSourceFieldMapping` itself, so `computeMappingWarnings`
 * has no dependency on `mappings.service.ts` and can be called with a plain
 * `tx.sourceFieldMapping.findMany({ select: {...} })` projection from
 * anywhere (`SourcePurposesService` included).
 */
export interface MappingForWarningCheck {
  sourceField: string;
  canonicalField: CanonicalField;
  dataCategory: DataCategory;
  containsPersonalData: boolean;
}

/**
 * CN-02, task 13 review Important-2: this is a STANDING property of
 * (mappings x purposes), not a one-time check computed only when the
 * mapping set itself changes. Spec line 746 states a condition that
 * HOLDS ("a source with no purpose attached ... shows 'Purpose not
 * configured' everywhere it appears"), not an action that occurred, and
 * §4.3's neighbouring rules are standing properties in the identical
 * voice ("every screen", "everywhere it appears"). So this same
 * computation is called from BOTH `MappingsService.replace()` (after a
 * mapping set changes) AND `SourcePurposesService.replace()` (after the
 * attached-purpose set changes) -- a source's minimisation warnings must
 * reflect the CURRENT state of both, not just whichever one was written
 * to most recently.
 *
 * Computed against the UNION of `dataCategories` across every
 * `ProcessingPurpose` CURRENTLY attached to this source (read inside the
 * SAME transaction the caller's write just committed to, via `tx`, so
 * this always reflects the state as just persisted -- never a separate,
 * possibly-stale connection). Only mappings that actually collect
 * personal data under some category are considered:
 *
 *  - `containsPersonalData: false` collects nothing personal despite
 *    carrying a `dataCategory` (which defaults to `OTHER`) -- CN-02 has
 *    nothing to say about a field that isn't personal data.
 *  - `canonicalField: "IGNORE"` means the field is not carried forward
 *    at all (task brief) -- it collects nothing, so it is exempt from
 *    this warning for the same reason, regardless of `containsPersonalData`
 *    or `dataCategory`. (It is NOT exempt from the Task 12 sample-scrub
 *    contract -- see `MappingsService.replace()`'s comment on that
 *    asymmetry, which is deliberate and the safe direction: scrubbing an
 *    IGNORE'd field's sample discards a value nobody will ever read
 *    through this mapping, whereas warning about it would falsely claim
 *    a field is being collected when it explicitly is not.)
 */
export async function computeMappingWarnings(
  tx: ScopedTransactionClient,
  dataSourceId: string,
  mappings: readonly MappingForWarningCheck[],
): Promise<MappingWarning[]> {
  const links = await tx.dataSourcePurpose.findMany({
    where: { dataSourceId },
    include: {
      purpose: {
        select: { id: true, code: true, name: true, dataCategories: true },
      },
    },
  });
  const attachedPurposes: MappingWarningPurposeSummary[] = links.map(
    (link) => link.purpose,
  );
  const necessaryCategories = new Set<DataCategory>(
    attachedPurposes.flatMap((p) => p.dataCategories),
  );

  const warnings: MappingWarning[] = [];
  for (const mapping of mappings) {
    if (!mapping.containsPersonalData || mapping.canonicalField === "IGNORE") {
      continue;
    }
    if (necessaryCategories.has(mapping.dataCategory)) {
      continue;
    }
    const type: MappingWarningType =
      attachedPurposes.length === 0
        ? "NO_PURPOSES_ATTACHED"
        : "CATEGORY_OUTSIDE_PURPOSES";
    const message =
      type === "NO_PURPOSES_ATTACHED"
        ? `Field "${mapping.sourceField}" (${mapping.canonicalField}) ` +
          `collects data category ${mapping.dataCategory}, but this data ` +
          "source has no processing purpose attached -- never guess one " +
          "(spec line 746); a human must attach one via " +
          "PUT /api/data-sources/:id/purposes."
        : `Field "${mapping.sourceField}" (${mapping.canonicalField}) ` +
          `collects data category ${mapping.dataCategory}, which is not ` +
          "declared as necessary by any of this source's attached " +
          `purposes (${attachedPurposes.map((p) => p.code).join(", ")}). ` +
          "This warns -- it does not block; a human decides (CN-02).";
    warnings.push({
      type,
      sourceField: mapping.sourceField,
      canonicalField: mapping.canonicalField,
      dataCategory: mapping.dataCategory,
      attachedPurposes,
      message,
    });
  }
  return warnings;
}
