import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import type { ConsentStatus } from "@prisma/client";

/**
 * `POST /api/me/consents/:purposeId` -- the Data Principal's own portal
 * action (CN-05: grant and withdraw sit at the same depth, reachable in
 * the same number of clicks). Channel is never accepted here -- it is
 * always `PORTAL`, forced by `MeConsentsController`, exactly like `ip`/
 * `userAgent` are always taken from the request, never this body.
 *
 * `noticeId`/`givenByGuardianId` are optional here for the same reason
 * `ImportConsentDto` leaves them optional: `ConsentsService` enforces
 * "required when GRANTED/DENIED" itself, after its own domain checks
 * have already run, to avoid this codebase's known
 * `@ValidateIf`-fires-before-the-service bug class.
 */
export class SetMyConsentDto {
  @ApiProperty({
    enum: ["GRANTED", "DENIED", "WITHDRAWN"],
    description:
      "The consent decision she is making right now. Never UNKNOWN or " +
      "NOT_REQUIRED.",
  })
  @IsIn(["GRANTED", "DENIED", "WITHDRAWN"])
  status!: Extract<ConsentStatus, "GRANTED" | "DENIED" | "WITHDRAWN">;

  @ApiPropertyOptional({
    description:
      "The PrivacyNotice id she was shown for this purpose (NT-01). " +
      "Required (service-enforced) for GRANTED/DENIED; optional for " +
      "WITHDRAWN, which reuses the record's existing notice reference.",
  })
  @IsOptional()
  @IsUUID()
  noticeId?: string;

  @ApiPropertyOptional({
    description:
      "Required (service-enforced) when status is GRANTED and she is " +
      "CHILD/GUARDIAN_REPRESENTED -- an active, verified " +
      "GuardianRelationship id (Rule 10).",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  givenByGuardianId?: string;

  @ApiPropertyOptional({
    description: "Extra evidence merged alongside ip/userAgent.",
  })
  @IsOptional()
  @IsObject()
  evidence?: { campaignId?: string; sessionRef?: string };
}
