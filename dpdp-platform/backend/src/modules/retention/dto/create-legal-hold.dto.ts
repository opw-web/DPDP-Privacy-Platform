import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LegalHoldScopeDto {
  @ApiPropertyOptional({ description: "Empty/omitted scope = organization-wide hold." })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  principalIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  purposeIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

export class CreateLegalHoldDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiProperty({ description: "The citation shown alongside the hold, e.g. a court order or Board directive reference." })
  @IsString()
  @MinLength(1)
  legalCitation!: string;

  @ApiPropertyOptional({ type: LegalHoldScopeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LegalHoldScopeDto)
  scope?: LegalHoldScopeDto;

  @ApiPropertyOptional({ description: "Omit for an open-ended hold." })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
