import { ApiProperty } from "@nestjs/swagger";
import { CanonicalField, DataCategory } from "@prisma/client";
import type { MappingWarningType } from "../mapping-warnings";

/**
 * Swagger-only mirror of `MappingWarningPurposeSummary` (`mapping-warnings.ts`).
 * The actual runtime type lives there, unchanged -- this class exists
 * purely so `@ApiOkResponse` has a concrete shape to hand `/api/docs`; the
 * services still return the real `MappingWarningPurposeSummary` interface,
 * never an instance of this class.
 */
export class MappingWarningPurposeSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: DataCategory, isArray: true })
  dataCategories!: DataCategory[];
}

/**
 * Swagger-only mirror of `MappingWarning` (`mapping-warnings.ts`) -- see
 * that file for the actual runtime type and the CN-02 ruling behind it.
 * Deliberately does NOT redefine, rename or extend `MappingWarning`
 * itself: both `GET` and `PUT /:id/mappings` (and `PUT /:id/purposes`)
 * return the real interface, computed by the one shared
 * `computeMappingWarnings()`; this class only documents that shape.
 */
export class MappingWarningResponseDto {
  @ApiProperty({
    enum: ["NO_PURPOSES_ATTACHED", "CATEGORY_OUTSIDE_PURPOSES"],
    description:
      "NO_PURPOSES_ATTACHED: this source has no purpose attached at all, " +
      "so every containsPersonalData mapping warns (spec line 746). " +
      "CATEGORY_OUTSIDE_PURPOSES: at least one purpose is attached, but " +
      "none of them declares this mapping's dataCategory as necessary.",
  })
  type!: MappingWarningType;

  @ApiProperty()
  sourceField!: string;

  @ApiProperty({ enum: CanonicalField })
  canonicalField!: CanonicalField;

  @ApiProperty({ enum: DataCategory })
  dataCategory!: DataCategory;

  @ApiProperty({
    type: [MappingWarningPurposeSummaryResponseDto],
    description:
      "Every purpose currently attached to this source -- [] for NO_PURPOSES_ATTACHED.",
  })
  attachedPurposes!: MappingWarningPurposeSummaryResponseDto[];

  @ApiProperty()
  message!: string;
}
