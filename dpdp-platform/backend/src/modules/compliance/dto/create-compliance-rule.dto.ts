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
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DeadlineUnit, RuleBasis } from "@prisma/client";

/**
 * These decorators are the first line of defence only.
 * `ComplianceService.create()`/`update()` re-derive and re-check the
 * GRIEVANCE_RESPONSE 90-day ceiling independently against the actual
 * effective values about to be written, same discipline as
 * `CreatePurposeDto`/`PurposesService.validateBasis()`.
 */
export class CreateComplianceRuleDto {
  @ApiProperty({
    description:
      "Stable code, e.g. GRIEVANCE_RESPONSE. Immutable once created -- " +
      "PATCH the current version to create version N+1 instead of " +
      "creating a second row with the same code.",
  })
  @IsString()
  @MinLength(1)
  ruleCode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: 'Defaults to "IN".' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  jurisdiction?: string;

  @ApiProperty({
    description:
      'The citation transcribed verbatim, e.g. "DPDP Rules, 2025 — Rule 14(3): ...".',
  })
  @IsString()
  @MinLength(1)
  legalSource!: string;

  @ApiProperty({
    enum: RuleBasis,
    description:
      "Never label an ORG_POLICY or INTERNAL_TARGET rule STATUTORY -- " +
      "telling a customer their own SLA is the law is worse than having " +
      "no number.",
  })
  @IsEnum(RuleBasis)
  basis!: RuleBasis;

  @ApiProperty({
    description:
      'The lookup key ComplianceService.resolveRule() matches on, e.g. "REQUEST:GRIEVANCE".',
  })
  @IsString()
  @MinLength(1)
  appliesTo!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  deadlineValue!: number;

  @ApiProperty({ enum: DeadlineUnit })
  @IsEnum(DeadlineUnit)
  deadlineUnit!: DeadlineUnit;

  @ApiProperty({
    description:
      "Warning lead before dueAt: hours if deadlineUnit is HOURS, " +
      "otherwise days (matches every row of the spec's seed table).",
  })
  @IsInt()
  @Min(0)
  warningLead!: number;

  @ApiPropertyOptional({ description: "Defaults to false." })
  @IsOptional()
  @IsBoolean()
  escalateOnBreach?: boolean;

  @ApiPropertyOptional({
    description: "RT-11: the period the company publishes, if different wording is needed.",
  })
  @IsOptional()
  @IsString()
  publishedPeriodText?: string;

  @ApiPropertyOptional({ description: "ISO date-time. Defaults to now." })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: "ISO date-time. Defaults to open-ended (null)." })
  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @ApiPropertyOptional({ description: "Defaults to true." })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
