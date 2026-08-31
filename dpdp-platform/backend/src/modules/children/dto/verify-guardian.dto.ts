import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GuardianVerification } from "@prisma/client";

/**
 * `POST /api/guardians/:id/verify` -- Rule 10's seven verification
 * methods, mirrored exactly from the `GuardianVerification` enum. `NONE`
 * is a real enum member (the schema default, meaning "not yet verified")
 * but is rejected here at the service layer -- verifying a guardian by
 * setting the method BACK to "not verified" is not a verification act.
 *
 * The platform records which method was used and its reference; it does
 * NOT call out to a Digital Locker, court registry, or any other external
 * system to confirm the claim -- that integration is out of scope (spec
 * §4.4, CH-01…CH-03). `verificationReference` is the token
 * reference/DigiLocker reference/court order number the employee is
 * attesting to, typed as free text.
 */
export class VerifyGuardianDto {
  @ApiProperty({
    enum: GuardianVerification,
    description:
      "Rule 10 method. This endpoint RECORDS which method was used and " +
      "its reference -- it does not itself call DigiLocker, a court " +
      "registry, or any other external verifier; that integration is out " +
      "of scope.",
  })
  @IsEnum(GuardianVerification)
  verification!: GuardianVerification;

  @ApiPropertyOptional({
    description:
      "The token reference, DigiLocker reference, or court order number " +
      "being attested to.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  verificationReference?: string;
}
