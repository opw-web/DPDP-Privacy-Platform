import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Transcribed verbatim from the schema comments (spec lines 439-441) -- labels, not retention-period literals. */
export const RETENTION_TRIGGER_TYPES = [
  "PURPOSE_SERVED",
  "CONSENT_WITHDRAWN",
  "INACTIVITY",
  "FIXED_PERIOD",
] as const;
export const RETENTION_UNITS = ["DAYS", "MONTHS", "YEARS"] as const;
export const RETENTION_LEGAL_BASIS_TYPES = [
  "STATUTORY",
  "SECTORAL",
  "ORG_POLICY",
] as const;

/**
 * `retentionValue`/`retentionUnit`/`minimumRetentionValue`/
 * `minimumRetentionUnit`/`preErasureNoticeHours` are DATA a human
 * enters, never code constants -- Global Constraint 4: no retention
 * period may appear as a literal in application logic. This DTO has no
 * default for `retentionValue`/`retentionUnit` (there is none in the
 * schema either -- they are the policy itself); `RetentionService`
 * deliberately OMITS `minimumRetentionValue`/`minimumRetentionUnit`/
 * `preErasureNoticeHours` from the `create()` payload when the caller
 * does not supply them, so Postgres's own column defaults
 * (already transcribed into the Prisma schema, not restated here) apply, rather
 * than this service repeating those numbers as a second literal
 * fallback.
 */
export class CreateRetentionPolicyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  purposeId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: RETENTION_TRIGGER_TYPES })
  @IsIn(RETENTION_TRIGGER_TYPES)
  triggerType!: string;

  @ApiProperty({ description: "The retention period's numeric value." })
  @IsInt()
  @Min(1)
  retentionValue!: number;

  @ApiProperty({ enum: RETENTION_UNITS })
  @IsIn(RETENTION_UNITS)
  retentionUnit!: string;

  @ApiProperty({
    description: "Statute / sectoral rule / company policy citation.",
  })
  @IsString()
  @MinLength(1)
  legalBasisForRetention!: string;

  @ApiProperty({ enum: RETENTION_LEGAL_BASIS_TYPES })
  @IsIn(RETENTION_LEGAL_BASIS_TYPES)
  legalBasisType!: string;

  @ApiPropertyOptional({
    default: 1,
    description: "RE-06: Rule 8(3) one-year floor. Defaults per the schema.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumRetentionValue?: number;

  @ApiPropertyOptional({ enum: RETENTION_UNITS, default: "YEARS" })
  @IsOptional()
  @IsIn(RETENTION_UNITS)
  minimumRetentionUnit?: string;

  @ApiPropertyOptional({
    description:
      "RE-05: Rule 8(2), configurable and cited. Defaults per the schema.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  preErasureNoticeHours?: number;

  @ApiPropertyOptional({
    default: false,
    description: "RE-04: Third Schedule carve-out.",
  })
  @IsOptional()
  @IsBoolean()
  accountAccessCarveOut?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
