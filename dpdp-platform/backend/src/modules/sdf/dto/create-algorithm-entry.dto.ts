import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ALGORITHM_OPERATIONS } from "./algorithm-operations";

/** `POST /api/sdf/algorithms` -- one entry per algorithmic system
 * touching personal data (SD-05, Rule 13(3)). */
export class CreateAlgorithmEntryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty({ enum: ALGORITHM_OPERATIONS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ALGORITHM_OPERATIONS, { each: true })
  operations!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  riskAssessment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  riskToRightsIdentified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mitigations?: string;

  @ApiPropertyOptional({ description: "ISO date-time of the last risk review." })
  @IsOptional()
  @IsDateString()
  lastReviewedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewedByEmployeeId?: string;
}
