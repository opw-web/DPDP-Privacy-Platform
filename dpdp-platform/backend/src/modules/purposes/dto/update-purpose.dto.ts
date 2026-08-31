import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { DataCategory, LawfulBasis, LegitimateUseLimb } from "@prisma/client";

/**
 * Every field optional (PATCH semantics) -- a field left out of the body
 * is left unchanged by `PurposesService.update()`. `legitimateUseLimb`
 * additionally accepts an explicit `null` (to clear a limb when switching
 * an existing LEGITIMATE_USE purpose to CONSENT); `@ValidateIf` lets
 * `null` through untouched while still enforcing the enum for any
 * non-null value.
 *
 * As with `CreatePurposeDto`, these decorators are the first line of
 * defence only -- `PurposesService.validateBasis()` re-derives the
 * EFFECTIVE (existing + patched) basis/limb/justification and is the
 * authoritative check.
 */
export class UpdatePurposeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional({ enum: LawfulBasis })
  @IsOptional()
  @IsEnum(LawfulBasis)
  lawfulBasis?: LawfulBasis;

  @ApiPropertyOptional({ enum: LegitimateUseLimb, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsEnum(LegitimateUseLimb)
  legitimateUseLimb?: LegitimateUseLimb | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  basisJustification?: string;

  @ApiPropertyOptional({ enum: DataCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories?: DataCategory[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goodsOrServicesDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
