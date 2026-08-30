import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  RETENTION_LEGAL_BASIS_TYPES,
  RETENTION_TRIGGER_TYPES,
  RETENTION_UNITS,
} from "./create-retention-policy.dto";

/** Every field is required when supplied: null is not a retention-policy value. */
export class UpdateRetentionPolicyDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  purposeId?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: RETENTION_TRIGGER_TYPES })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(RETENTION_TRIGGER_TYPES)
  triggerType?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  retentionValue?: number;

  @ApiPropertyOptional({ enum: RETENTION_UNITS })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(RETENTION_UNITS)
  retentionUnit?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  legalBasisForRetention?: string;

  @ApiPropertyOptional({ enum: RETENTION_LEGAL_BASIS_TYPES })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(RETENTION_LEGAL_BASIS_TYPES)
  legalBasisType?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  minimumRetentionValue?: number;

  @ApiPropertyOptional({ enum: RETENTION_UNITS })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(RETENTION_UNITS)
  minimumRetentionUnit?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  preErasureNoticeHours?: number;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  accountAccessCarveOut?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}
