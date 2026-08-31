import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Rule 6(1)(a)-(g), transcribed verbatim from the schema comment (spec line 432). */
export const SECURITY_RULE_REFERENCES = [
  "Rule 6(1)(a)",
  "Rule 6(1)(b)",
  "Rule 6(1)(c)",
  "Rule 6(1)(d)",
  "Rule 6(1)(e)",
  "Rule 6(1)(f)",
  "Rule 6(1)(g)",
] as const;

/** Transcribed verbatim from the schema comment (spec lines 433-435). */
export const SECURITY_MEASURE_TYPES = [
  "ENCRYPTION",
  "MASKING",
  "TOKENISATION",
  "ACCESS_CONTROL",
  "LOGGING",
  "BACKUP",
  "CONTRACT_CLAUSE",
  "ORG_MEASURE",
] as const;

/**
 * `dataSourceId` null means an organization-wide measure (task brief) --
 * this DTO leaves it optional/omittable for exactly that reason, not as
 * an oversight. `SecurityMeasuresService` verifies a supplied
 * `dataSourceId` belongs to this organization before writing, same
 * convention as every other register's foreign-key check in this module.
 */
export class CreateSecurityMeasureDto {
  @ApiPropertyOptional({
    description: "Omit for an organization-wide measure.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  dataSourceId?: string;

  @ApiProperty({ enum: SECURITY_RULE_REFERENCES })
  @IsIn(SECURITY_RULE_REFERENCES)
  ruleReference!: string;

  @ApiProperty({ enum: SECURITY_MEASURE_TYPES })
  @IsIn(SECURITY_MEASURE_TYPES)
  measureType!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  implemented?: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  description!: string;

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
