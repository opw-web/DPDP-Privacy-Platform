import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { DataCategory } from "@prisma/client";

/**
 * Every field optional (PATCH semantics). `description`, if supplied,
 * still cannot be blank -- `SharingService.update()` re-checks the
 * EFFECTIVE (existing + patch) description is non-blank, the same
 * discipline as `PurposesService.validateBasis()`, so s.11(1)(b)'s
 * requirement cannot be defeated by patching a real description down to
 * whitespace.
 */
export class UpdateSharingActivityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  purposeId?: string;

  @ApiPropertyOptional({ enum: DataCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories?: DataCategory[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  sourceIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
