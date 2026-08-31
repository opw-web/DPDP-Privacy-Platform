import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import type { ConsentChannel, ConsentStatus } from "@prisma/client";

/**
 * `POST /api/principals/:id/consents/:purposeId` -- "(imported consent)"
 * per the spec's endpoint table (lines 843-845): an employee recording a
 * consent decision that happened somewhere else (a legacy system, a
 * phone call, a paper form, a consent manager per CN-08). This is NOT
 * how a Data Principal grants or withdraws her own consent -- that is
 * `POST /api/me/consents/:purposeId`, always channel `PORTAL`, forced
 * server-side.
 *
 * `status` deliberately excludes `UNKNOWN` and `NOT_REQUIRED`: those are
 * never a target of a WRITE (`UNKNOWN` is backfill's default absence-of-
 * evidence value -- Global Constraint 9 -- and `NOT_REQUIRED` has no
 * writer in this task at all, since a `ConsentRecord` only ever exists
 * for a `CONSENT`-basis purpose in the first place).
 *
 * `noticeId` and `givenByGuardianId` are validated as REQUIRED-when
 * conditions inside `ConsentsService`, not with `@ValidateIf` here --
 * this codebase's documented bug class (Task 6): a conditional
 * class-validator decorator runs in the global `ValidationPipe` BEFORE
 * the service, so it can return a wrong-shaped 400 for a domain problem
 * a 404/409/Rule-10 check further down should have reported first. Both
 * stay plain `@IsOptional()` here; `ConsentsService.applyStatusChange`
 * enforces "noticeId is required for GRANTED/DENIED" and defers to
 * `GuardiansService.assertGuardianConsentEligible` for the guardian rule,
 * in an order this task controls.
 */
export class ImportConsentDto {
  @ApiProperty({
    enum: ["GRANTED", "DENIED", "WITHDRAWN"],
    description:
      "The consent decision being recorded. Never UNKNOWN or " +
      "NOT_REQUIRED -- those are never written by this endpoint.",
  })
  @IsIn(["GRANTED", "DENIED", "WITHDRAWN"])
  status!: Extract<ConsentStatus, "GRANTED" | "DENIED" | "WITHDRAWN">;

  @ApiProperty({
    enum: ["EMAIL", "IMPORTED", "IN_PERSON", "API", "CONSENT_MANAGER"],
    description:
      "Never PORTAL here -- PORTAL is reserved for the Data Principal's " +
      "own self-service action via /api/me/consents/:purposeId.",
  })
  @IsIn(["EMAIL", "IMPORTED", "IN_PERSON", "API", "CONSENT_MANAGER"])
  channel!: Extract<
    ConsentChannel,
    "EMAIL" | "IMPORTED" | "IN_PERSON" | "API" | "CONSENT_MANAGER"
  >;

  @ApiPropertyOptional({
    description:
      "The PrivacyNotice id she was shown (NT-01). Required in the " +
      "service layer when status is GRANTED or DENIED -- the published " +
      "version's id and content hash are resolved and frozen onto the " +
      "ConsentRecord/ConsentEvent (CN-09). Optional for WITHDRAWN, which " +
      "reuses the record's existing notice reference if omitted.",
  })
  @IsOptional()
  @IsUUID()
  noticeId?: string;

  @ApiPropertyOptional({
    description:
      "Required (enforced in the service) when status is GRANTED and " +
      "the principal's ageStatus is CHILD/GUARDIAN_REPRESENTED -- an " +
      "active, verified GuardianRelationship id (Rule 10).",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  givenByGuardianId?: string;

  @ApiPropertyOptional({
    description:
      "Extra evidence merged into the ConsentEvent/ConsentRecord " +
      "evidence JSON alongside ip/userAgent (always taken from the " +
      "request, never from this body).",
  })
  @IsOptional()
  @IsObject()
  evidence?: { campaignId?: string; sessionRef?: string };
}
