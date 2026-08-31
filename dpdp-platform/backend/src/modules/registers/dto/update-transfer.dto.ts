import {
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

/** Omitted fields are unchanged; notes and review fields may be cleared with null. */
export class UpdateTransferDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  recipientId?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  destinationCountry?: string;

  @ApiPropertyOptional({ enum: DataCategory, isArray: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories?: DataCategory[];

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  purposeDescription?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  govtRestrictionChecked?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  govtRestrictionNotes?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  sectoralRestrictionNotes?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  localisationRequired?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  reviewedByEmployeeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString()
  reviewedAt?: string | null;
}
