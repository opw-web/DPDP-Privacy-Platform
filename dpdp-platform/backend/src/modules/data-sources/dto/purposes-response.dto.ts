import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DataCategory, LawfulBasis, LegitimateUseLimb } from "@prisma/client";

/**
 * Swagger-only mirror of `PublicPurpose` (`purposes/purposes.service.ts`) --
 * the shape both `PUT` and `GET /api/data-sources/:id/purposes` return for
 * each attached purpose. `isReviewed` is `reviewedByEmployeeId !== null`,
 * derived by the one shared `toPublicPurpose()` -- the frontend renders
 * the amber "Not yet reviewed" chip whenever this is `false`, never by
 * re-deriving it from `reviewedByEmployeeId` itself.
 */
export class DataSourcePurposeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    description: "Unique per organization, e.g. ORDER_FULFILMENT.",
  })
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    description: "Plain language description, reused in notices (MVP 2).",
  })
  description!: string;

  @ApiProperty({ enum: LawfulBasis })
  lawfulBasis!: LawfulBasis;

  @ApiPropertyOptional({
    enum: LegitimateUseLimb,
    description:
      "The s.7(a)-(i) limb. Present only when lawfulBasis is LEGITIMATE_USE.",
    nullable: true,
  })
  legitimateUseLimb!: LegitimateUseLimb | null;

  @ApiProperty()
  basisJustification!: string;

  @ApiProperty({ enum: DataCategory, isArray: true })
  dataCategories!: DataCategory[];

  @ApiPropertyOptional({ nullable: true })
  goodsOrServicesDescription!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Set once a human reviews this purpose (Employee.id).",
  })
  reviewedByEmployeeId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: "date-time" })
  reviewedAt!: Date | null;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: Date;

  @ApiProperty({
    description:
      "reviewedByEmployeeId !== null. An unreviewed purpose (false) must " +
      'render the amber "Not yet reviewed" chip everywhere it appears.',
  })
  isReviewed!: boolean;
}

/** Response shape for `GET /api/data-sources/:id/purposes`. */
export class DataSourcePurposesResponseDto {
  @ApiProperty({
    type: [DataSourcePurposeResponseDto],
    description:
      "Every ProcessingPurpose currently attached to this data source -- " +
      "[] when none is attached. Never a guessed purpose (Check 11 / LB-02): " +
      "a purpose is either attached and stated, or absent and stated as absent.",
  })
  purposes!: DataSourcePurposeResponseDto[];
}
