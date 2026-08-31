import {
  IsBoolean,
  IsDateString,
  IsIn,
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
 * Omitted fields are unchanged. The nullable association, evidence, and
 * review fields accept explicit null to clear them.
 */
export class UpdateSecurityMeasureDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MinLength(1)
  dataSourceId?: string | null;

  @ApiPropertyOptional({ enum: SECURITY_RULE_REFERENCES })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(SECURITY_RULE_REFERENCES)
  ruleReference?: string;

  @ApiPropertyOptional({ enum: SECURITY_MEASURE_TYPES })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(SECURITY_MEASURE_TYPES)
  measureType?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  implemented?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  evidenceReference?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString()
  lastReviewedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  reviewedByEmployeeId?: string | null;
}
