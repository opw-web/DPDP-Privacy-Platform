import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { REQUESTING_BODIES } from "./requesting-body";

/**
 * `PATCH /api/information-requests/:id`. Every field optional (PATCH
 * semantics; a field left out is left unchanged) -- used both to record
 * what was furnished (`respondedAt`, `responseReference`) and to record
 * or amend a non-disclosure direction after the request was first
 * logged. Rule 23(2)'s "a direction needs its authorisation reference"
 * requirement is enforced in `InformationRequestsService.update` against
 * the EFFECTIVE (existing row merged with this patch) state, not as a
 * conditional validator here -- same discipline as
 * `CreateInformationRequestDto`'s doc comment.
 */
export class UpdateInformationRequestDto {
  @ApiPropertyOptional({ enum: REQUESTING_BODIES })
  @IsOptional()
  @IsIn(REQUESTING_BODIES)
  requestingBody?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  authorisedPersonRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  purposeCited?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  responseDueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  nonDisclosureDirected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nonDisclosurePermissionRef?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  affectedPrincipalIds?: string[];

  @ApiPropertyOptional({ description: "ISO date-time the response was furnished." })
  @IsOptional()
  @IsDateString()
  respondedAt?: string;

  @ApiPropertyOptional({ description: "Reference of what was furnished in response." })
  @IsOptional()
  @IsString()
  responseReference?: string;
}
