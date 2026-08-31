import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GuardianKind } from "@prisma/client";
import { APPOINTING_AUTHORITIES } from "../appointing-authority";

/**
 * Registers a `GuardianRelationship`. Deliberately carries NO
 * `verification`/`verificationReference`/`verifiedByEmployeeId`/
 * `verifiedAt` fields -- Rule 10 verification is always a distinct,
 * separately-audited act (`POST /api/guardians/:id/verify`), never
 * something a caller can set at registration time by simply including it
 * in this body. A brand-new guardian relationship is always born
 * `verification: NONE` (the schema's own default).
 *
 * `appointingAuthority`/`appointmentReference` are accepted here (Rule 11
 * requires them at the point the relationship is claimed to be a
 * `LAWFUL_GUARDIAN_OF_PWD`) but their presence is only ENFORCED for that
 * kind -- `GuardiansService.assertPwdAppointmentValid` re-checks this
 * against the values about to be written, the same discipline as
 * `PurposesService.validateBasis()`.
 */
export class CreateGuardianDto {
  @ApiProperty({
    description: "The child or person with disability this guardian acts for.",
  })
  @IsString()
  @MinLength(1)
  dataPrincipalId!: string;

  @ApiProperty({ enum: GuardianKind })
  @IsEnum(GuardianKind)
  kind!: GuardianKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  guardianName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  guardianEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @ApiPropertyOptional({
    enum: APPOINTING_AUTHORITIES,
    description:
      "Rule 11: required, and must be one of these three, when kind is " +
      "LAWFUL_GUARDIAN_OF_PWD.",
  })
  @IsOptional()
  @IsIn(APPOINTING_AUTHORITIES)
  appointingAuthority?: string;

  @ApiPropertyOptional({
    description:
      "Rule 11: the appointment order/reference number. Required when " +
      "kind is LAWFUL_GUARDIAN_OF_PWD.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  appointmentReference?: string;
}
