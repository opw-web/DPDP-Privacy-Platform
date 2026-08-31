import { IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { AgeStatus } from "@prisma/client";

/**
 * `POST /api/principals/:id/age-status` -- an EMPLOYEE'S explicit
 * determination. There is no `dateOfBirth` field here and never will be:
 * age is set by a human declaring a status, not by the platform
 * inferring one from behaviour, product category, or name (spec line
 * 670). DOB-based derivation stays exclusively `AgeService.derive()`'s
 * job (`ageStatusSource: DOB_DERIVED`), which already bails out the
 * moment `ageStatusSource` reads `EMPLOYEE_SET` -- see that service's own
 * comment. This endpoint is what puts `EMPLOYEE_SET` there in the first
 * place.
 */
export class SetAgeStatusDto {
  @ApiProperty({ enum: AgeStatus })
  @IsEnum(AgeStatus)
  ageStatus!: AgeStatus;
}
