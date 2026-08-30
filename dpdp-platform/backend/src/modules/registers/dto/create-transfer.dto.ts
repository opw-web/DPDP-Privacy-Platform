import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DataCategory } from "@prisma/client";

/**
 * The platform does NOT decide whether a cross-border transfer is
 * lawful (task brief) -- there is no validation anywhere in
 * `TransfersService` that approves, blocks, or infers lawfulness from
 * `destinationCountry`, `govtRestrictionChecked` or
 * `sectoralRestrictionNotes`. This DTO and its service only record what
 * a human checked and when.
 */
export class CreateTransferDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  recipientId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  destinationCountry!: string;

  @ApiPropertyOptional({ enum: DataCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories?: DataCategory[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  purposeDescription!: string;

  @ApiPropertyOptional({ default: false, description: "s.16 / Rule 15." })
  @IsOptional()
  @IsBoolean()
  govtRestrictionChecked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  govtRestrictionNotes?: string;

  @ApiPropertyOptional({ description: "CB-02: RBI/SEBI/IRDAI etc." })
  @IsOptional()
  @IsString()
  sectoralRestrictionNotes?: string;

  @ApiPropertyOptional({ default: false, description: "CB-03 / Rule 13(4)." })
  @IsOptional()
  @IsBoolean()
  localisationRequired?: boolean;

  @ApiPropertyOptional({
    description: "The employee who checked the restrictions above.",
  })
  @IsOptional()
  @IsString()
  reviewedByEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reviewedAt?: string;
}
