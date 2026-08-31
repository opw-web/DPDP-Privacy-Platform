import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { DeadlineUnit, RuleBasis } from "@prisma/client";

/**
 * Every field optional (PATCH semantics) -- a field left out is left
 * unchanged from the current version by `ComplianceService.update()`,
 * which then writes the merged result as version N+1. There is
 * deliberately no `ruleCode` or `appliesTo` field here: both are
 * immutable once a rule exists (same reasoning as `code` being absent
 * from `UpdatePurposeDto` -- changing either would orphan whatever
 * already resolved against the old lookup key).
 */
export class UpdateComplianceRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  jurisdiction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  legalSource?: string;

  @ApiPropertyOptional({ enum: RuleBasis })
  @IsOptional()
  @IsEnum(RuleBasis)
  basis?: RuleBasis;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  deadlineValue?: number;

  @ApiPropertyOptional({ enum: DeadlineUnit })
  @IsOptional()
  @IsEnum(DeadlineUnit)
  deadlineUnit?: DeadlineUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  warningLead?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  escalateOnBreach?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publishedPeriodText?: string;

  @ApiPropertyOptional({ description: "ISO date-time." })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: "ISO date-time." })
  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
