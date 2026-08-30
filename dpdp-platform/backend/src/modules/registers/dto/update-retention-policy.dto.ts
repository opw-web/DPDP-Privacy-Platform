import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  RETENTION_LEGAL_BASIS_TYPES,
  RETENTION_TRIGGER_TYPES,
  RETENTION_UNITS,
} from "./create-retention-policy.dto";

/** Every field optional (PATCH semantics). Same Global Constraint 4 discipline as `CreateRetentionPolicyDto`. */
export class UpdateRetentionPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  purposeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: RETENTION_TRIGGER_TYPES })
  @IsOptional()
  @IsIn(RETENTION_TRIGGER_TYPES)
  triggerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionValue?: number;

  @ApiPropertyOptional({ enum: RETENTION_UNITS })
  @IsOptional()
  @IsIn(RETENTION_UNITS)
  retentionUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  legalBasisForRetention?: string;

  @ApiPropertyOptional({ enum: RETENTION_LEGAL_BASIS_TYPES })
  @IsOptional()
  @IsIn(RETENTION_LEGAL_BASIS_TYPES)
  legalBasisType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  minimumRetentionValue?: number;

  @ApiPropertyOptional({ enum: RETENTION_UNITS })
  @IsOptional()
  @IsIn(RETENTION_UNITS)
  minimumRetentionUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  preErasureNoticeHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  accountAccessCarveOut?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
