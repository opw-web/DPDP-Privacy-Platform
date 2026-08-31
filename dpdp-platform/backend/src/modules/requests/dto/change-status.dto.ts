import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { RequestStatus } from "@prisma/client";
import {
  ERASURE_STATUTORY_GROUNDS,
  type ErasureStatutoryGround,
} from "../requests.constants";

/**
 * `POST /api/requests/:ref/status` -- the single endpoint that drives
 * every legal move of the state machine (`RequestsService.TRANSITIONS`,
 * transcribed from spec lines 677-684). `rejectionReason`, `outcomeCode`
 * and `outcome` are deliberately just `@IsOptional() @IsString()` here,
 * NOT conditionally required via `@ValidateIf`, even though each is
 * genuinely required for its status (RT-09's 20-char `rejectionReason`,
 * a non-empty `outcomeCode`/`outcome`) -- Nest's `ValidationPipe` runs
 * BEFORE the controller/service ever sees the request, so a
 * `@ValidateIf`-conditional requirement fires even when the transition
 * itself is illegal, turning what must be a 409 (`assertLegalTransition`,
 * checked first in `RequestsService.changeStatus()`) into a premature
 * 400 (fixed here after Check 4 caught SUBMITTED -> COMPLETED returning
 * 400 instead of 409). `RequestsService.changeStatus()` re-derives and
 * re-checks every one of these requirements independently against the
 * request actually being changed (same discipline as
 * `CreateComplianceRuleDto`'s own doc comment, and the same reasoning
 * `statutoryGround` below already followed), because this DTO alone
 * cannot know the CURRENT status (for the 409 transition check) or the
 * request's `type` (for the ERASURE statutory-ground requirement).
 */
export class ChangeStatusDto {
  @ApiProperty({ enum: RequestStatus, description: "The target status." })
  @IsEnum(RequestStatus)
  status!: RequestStatus;

  @ApiPropertyOptional({
    description:
      "Required, at least 20 characters, when status is REJECTED (RT-09). " +
      "Service-layer enforced -- see class doc comment.",
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({
    enum: ERASURE_STATUTORY_GROUNDS,
    description:
      "Required when status is REJECTED and the request's type is ERASURE " +
      "-- the statutory ground relied on, s.12(3). Service-layer enforced " +
      "(this DTO cannot see the request's type).",
  })
  @IsOptional()
  @IsIn(ERASURE_STATUTORY_GROUNDS)
  statutoryGround?: ErasureStatutoryGround;

  @ApiPropertyOptional({
    description:
      "Required, non-empty, when status is COMPLETED. Service-layer " +
      "enforced -- see class doc comment.",
  })
  @IsOptional()
  @IsString()
  outcomeCode?: string;

  @ApiPropertyOptional({
    description:
      "Required, non-empty, when status is COMPLETED. Service-layer " +
      "enforced -- see class doc comment.",
  })
  @IsOptional()
  @IsString()
  outcome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: "Defaults to false." })
  @IsOptional()
  @IsBoolean()
  visibleToPrincipal?: boolean;
}
