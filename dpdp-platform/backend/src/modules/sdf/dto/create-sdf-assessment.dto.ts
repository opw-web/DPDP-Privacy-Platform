import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString } from "class-validator";
import { SdfAssessmentKind } from "@prisma/client";

const KIND_VALUES = Object.values(SdfAssessmentKind);

/**
 * `POST /api/sdf/assessments` -- opens one `SdfAssessment` row (spec
 * §4.11: "Two `SdfAssessment` rows per cycle, one `DPIA`, one `AUDIT`").
 * `dueAt` is deliberately NOT accepted here: `SdfAssessmentService.create`
 * always resolves `SDF_ASSESSMENT_CYCLE` via `ComplianceService.resolveRule`
 * and computes `dueAt` from `cycleStartedAt` plus the rule's own
 * deadline length -- never a caller-supplied date, and never a
 * hard-coded 12 months (task brief: "Resolve the cycle length from the
 * rule -- never hard-code 12"). This endpoint exists mainly for manual
 * cycle-opening/back-filling; the `sdf-cycle-scan` daily job (SD-03)
 * opens both rows of the current cycle automatically for every SDF
 * organization.
 */
export class CreateSdfAssessmentDto {
  @ApiProperty({ enum: SdfAssessmentKind })
  @IsIn(KIND_VALUES)
  kind!: SdfAssessmentKind;

  @ApiPropertyOptional({
    description:
      "ISO date-time the cycle started. Defaults to the organization's " +
      "`sdfNotifiedAt` if set, otherwise the current time.",
  })
  @IsOptional()
  @IsDateString()
  cycleStartedAt?: string;

  @ApiPropertyOptional({
    description:
      "Independent data auditor / assessor name. May be left blank at " +
      "creation and supplied later via the complete endpoint -- but an " +
      "AUDIT row cannot be marked complete without one (SD-02).",
  })
  @IsOptional()
  @IsString()
  conductedBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isIndependent?: boolean;
}
