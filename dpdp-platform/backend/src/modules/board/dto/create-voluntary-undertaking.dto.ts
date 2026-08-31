import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { UndertakingCommitmentDto } from "./undertaking-commitment.dto";

/**
 * `POST /api/voluntary-undertakings` (BD-06, s.32). Unlike
 * `InformationRequest.reference` (this platform's own internal tracking
 * number), `VoluntaryUndertaking.reference` is the Board's own
 * externally-issued document reference -- the spec gives this model no
 * `Counter` name (only `REQUEST, CAMPAIGN, BREACH, INFO_REQUEST` are
 * listed), so it is supplied by the caller rather than generated here.
 */
export class CreateVoluntaryUndertakingDto {
  @ApiProperty({ description: "The Board's own reference for this undertaking." })
  @IsString()
  @MinLength(1)
  reference!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  summary!: string;

  @ApiProperty({ description: "ISO date-time the undertaking was accepted." })
  @IsDateString()
  acceptedAt!: string;

  @ApiPropertyOptional({ type: [UndertakingCommitmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UndertakingCommitmentDto)
  commitments?: UndertakingCommitmentDto[];
}
