import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CanonicalField, DataCategory } from "@prisma/client";

/**
 * One row of the full-set replacement `PUT /api/data-sources/:id/mappings`
 * accepts. `dataCategory`, `containsPersonalData` and `isVerifiedCustomerId`
 * are all optional here -- Prisma's own column defaults
 * (`DataCategory.OTHER`, `true`, `false`; schema lines 342-345) apply when
 * omitted, exactly mirroring `CreatePurposeDto.dataCategories` and
 * `CreateDataSourceDto`'s optional-with-a-schema-default fields.
 *
 * `MappingsService.replace()` is the SOLE enforcement point for the
 * `isVerifiedCustomerId` gate (at most one per source, and only on a
 * `CUSTOMER_ID` mapping) -- not a decorator here -- for the same reason
 * `PurposesService.validateBasis()` re-checks its rules independently of
 * any DTO decorator: a decorator only ever sees ONE row in isolation and
 * cannot enforce an across-the-array "at most one" rule, and a future
 * refactor that loosens or drops a decorator must not silently reopen a
 * cross-row invariant.
 */
export class SourceFieldMappingDto {
  @ApiProperty({
    description:
      "The raw field name as discovered on the source system (DataSourceField.fieldName).",
  })
  @IsString()
  @MinLength(1)
  sourceField!: string;

  @ApiProperty({
    enum: CanonicalField,
    description: "IGNORE means this field is not carried forward.",
  })
  @IsEnum(CanonicalField)
  canonicalField!: CanonicalField;

  @ApiPropertyOptional({ enum: DataCategory, default: "OTHER" })
  @IsOptional()
  @IsEnum(DataCategory)
  dataCategory?: DataCategory;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  containsPersonalData?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      "Gate for identity-matching rule 1 (spec 4.4). At most one mapping " +
      "per source may set this, and only on a CUSTOMER_ID mapping -- " +
      "enforced by MappingsService.replace(), not by validation here.",
  })
  @IsOptional()
  @IsBoolean()
  isVerifiedCustomerId?: boolean;
}

/**
 * The request body for `PUT /api/data-sources/:id/mappings`: the COMPLETE
 * mapping set for that source, replacing whatever was there before in one
 * transaction (task brief -- "full-set replacement"). There is
 * deliberately no separate "add one mapping" or "delete one mapping"
 * route: the wizard (Task 24) always submits the whole set it is showing.
 */
export class ReplaceMappingsDto {
  @ApiProperty({ type: [SourceFieldMappingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SourceFieldMappingDto)
  mappings!: SourceFieldMappingDto[];
}
