import { ApiPropertyOptional } from "@nestjs/swagger";
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

/** `PATCH /api/sdf/algorithms/:id` -- every field optional (PATCH
 * semantics); a field left out is left unchanged. Used both for editing
 * an entry and for recording its periodic risk review (`riskAssessment`,
 * `lastReviewedAt`, `reviewedByEmployeeId`). */
export class UpdateAlgorithmEntryDto {
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

  @ApiPropertyOptional({ enum: ALGORITHM_OPERATIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ALGORITHM_OPERATIONS, { each: true })
  operations?: string[];

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
