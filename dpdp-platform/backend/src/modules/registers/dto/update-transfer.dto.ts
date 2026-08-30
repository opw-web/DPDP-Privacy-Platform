import {
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

/** Every field optional (PATCH semantics). Same no-lawfulness-logic rule as `CreateTransferDto`. */
export class UpdateTransferDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  recipientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  destinationCountry?: string;

  @ApiPropertyOptional({ enum: DataCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories?: DataCategory[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  purposeDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  govtRestrictionChecked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  govtRestrictionNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectoralRestrictionNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  localisationRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewedByEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reviewedAt?: string;
}
