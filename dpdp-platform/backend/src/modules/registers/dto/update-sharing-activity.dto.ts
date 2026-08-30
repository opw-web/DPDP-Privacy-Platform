import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { DataCategory } from "@prisma/client";

/**
 * Omitted fields are unchanged. `endedAt` is the only nullable field and
 * accepts explicit null to clear it.
 */
export class UpdateSharingActivityDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  recipientId?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  purposeId?: string;

  @ApiPropertyOptional({ enum: DataCategory, isArray: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories?: DataCategory[];

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  sourceIds?: string[];

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString()
  endedAt?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}
