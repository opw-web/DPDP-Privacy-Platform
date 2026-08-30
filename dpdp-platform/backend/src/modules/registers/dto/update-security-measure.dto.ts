import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  SECURITY_MEASURE_TYPES,
  SECURITY_RULE_REFERENCES,
} from "./create-security-measure.dto";

/**
 * Every field optional (PATCH semantics). `dataSourceId` additionally
 * accepts an explicit `null` (to turn a source-specific measure into an
 * organization-wide one) -- same `@ValidateIf` pattern as
 * `UpdatePurposeDto.legitimateUseLimb`.
 */
export class UpdateSecurityMeasureDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MinLength(1)
  dataSourceId?: string | null;

  @ApiPropertyOptional({ enum: SECURITY_RULE_REFERENCES })
  @IsOptional()
  @IsIn(SECURITY_RULE_REFERENCES)
  ruleReference?: string;

  @ApiPropertyOptional({ enum: SECURITY_MEASURE_TYPES })
  @IsOptional()
  @IsIn(SECURITY_MEASURE_TYPES)
  measureType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  implemented?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastReviewedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewedByEmployeeId?: string;
}
