import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
 * `POST /api/information-requests` (BD-01...BD-04, Rule 23 + Seventh
 * Schedule). `reference` is deliberately NOT accepted here -- unlike
 * `VoluntaryUndertaking` (an externally-issued s.32 document reference),
 * an `InformationRequest`'s reference is this platform's own internal
 * tracking number, allocated from `Counter('INFO_REQUEST')` by
 * `InformationRequestsService.create` (spec's "Add Counter names:
 * REQUEST, CAMPAIGN, BREACH, INFO_REQUEST"), the same pattern
 * `RequestsService` already established for `PrincipalRequest.reference`.
 *
 * `nonDisclosurePermissionRef` is deliberately NOT gated behind a
 * `@ValidateIf(o => o.nonDisclosureDirected) @MinLength(...)` conditional
 * validator on this DTO -- that shape of cross-field check runs inside
 * Nest's global `ValidationPipe`, BEFORE `InformationRequestsService`
 * ever sees the payload, and would return a bare 400 with no Rule 23(2)
 * context attached for what is actually a domain rejection (the exact
 * bug class the task brief calls out; Task 6 shipped it once already).
 * That requirement -- a non-disclosure direction needs its authorisation
 * reference -- is enforced in `InformationRequestsService.create` itself.
 */
export class CreateInformationRequestDto {
  @ApiProperty({ enum: REQUESTING_BODIES })
  @IsIn(REQUESTING_BODIES)
  requestingBody!: string;

  @ApiProperty({ description: "Seventh Schedule authorised person." })
  @IsString()
  @MinLength(1)
  authorisedPersonRef!: string;

  @ApiProperty({ description: "The Seventh Schedule purpose cited for the request." })
  @IsString()
  @MinLength(1)
  purposeCited!: string;

  @ApiProperty({ description: "ISO date-time the request was received." })
  @IsDateString()
  receivedAt!: string;

  @ApiProperty({
    description: "ISO date-time by which a response is due -- the request's own specified period.",
  })
  @IsDateString()
  responseDueAt!: string;

  @ApiPropertyOptional({ description: "Rule 23(2): whether a non-disclosure direction was issued." })
  @IsOptional()
  @IsBoolean()
  nonDisclosureDirected?: boolean;

  @ApiPropertyOptional({ description: "The authorisation reference for the non-disclosure direction." })
  @IsOptional()
  @IsString()
  nonDisclosurePermissionRef?: string;

  @ApiPropertyOptional({
    description: "DataPrincipal ids this request names -- suppressed from her portal/access report/evidence file when nonDisclosureDirected is true.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  affectedPrincipalIds?: string[];
}
