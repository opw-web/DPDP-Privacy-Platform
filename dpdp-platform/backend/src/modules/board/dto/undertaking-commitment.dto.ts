import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString, MinLength } from "class-validator";

/** `VoluntaryUndertaking.commitments`'s per-entry shape, per the spec's
 * own comment: `[{text, dueAt, status}]`. */
export const COMMITMENT_STATUSES = ["PENDING", "DONE", "OVERDUE"] as const;

export class UndertakingCommitmentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ enum: COMMITMENT_STATUSES })
  @IsOptional()
  @IsIn(COMMITMENT_STATUSES)
  status?: string;
}
