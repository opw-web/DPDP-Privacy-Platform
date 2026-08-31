import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { UndertakingCommitmentDto } from "./undertaking-commitment.dto";

/** `PATCH /api/voluntary-undertakings/:id` -- every field optional. */
export class UpdateVoluntaryUndertakingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  summary?: string;

  @ApiPropertyOptional({ type: [UndertakingCommitmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UndertakingCommitmentDto)
  commitments?: UndertakingCommitmentDto[];

  @ApiPropertyOptional({ description: "ISO date-time the undertaking was closed." })
  @IsOptional()
  @IsDateString()
  closedAt?: string;
}
