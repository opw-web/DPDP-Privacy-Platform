import { ApiProperty } from "@nestjs/swagger";
import {
  CanonicalField,
  DataCategory,
  MappingComparisonPolicy,
} from "@prisma/client";
import { MappingWarningResponseDto } from "./mapping-warning-response.dto";

/** Swagger-only mirror of `PublicSourceFieldMapping` (`mappings.service.ts`). */
export class SourceFieldMappingResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    description:
      "The raw field name as discovered on the source system (DataSourceField.fieldName).",
  })
  sourceField!: string;

  @ApiProperty({ enum: CanonicalField })
  canonicalField!: CanonicalField;

  @ApiProperty({ enum: DataCategory })
  dataCategory!: DataCategory;

  @ApiProperty()
  containsPersonalData!: boolean;

  @ApiProperty()
  isVerifiedCustomerId!: boolean;

  @ApiProperty({ enum: MappingComparisonPolicy })
  comparisonPolicy!: MappingComparisonPolicy;
}

/**
 * Response shape for both `PUT /api/data-sources/:id/mappings` and
 * `GET /api/data-sources/:id/mappings` -- deliberately the SAME shape,
 * because CN-02 is a STANDING property of the mapping set (see
 * `mapping-warnings.ts`), not a write-time event: reading the mappings
 * must surface exactly the warnings a write would have, computed by the
 * one shared `computeMappingWarnings()` both routes call.
 */
export class MappingsResponseDto {
  @ApiProperty({ type: [SourceFieldMappingResponseDto] })
  mappings!: SourceFieldMappingResponseDto[];

  @ApiProperty({ type: [MappingWarningResponseDto] })
  warnings!: MappingWarningResponseDto[];
}
