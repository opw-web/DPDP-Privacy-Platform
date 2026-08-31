import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

/**
 * `POST /api/requests/:ref/verify-identity`. `method` is free text
 * describing which check was performed (e.g. "OTP to registered mobile",
 * "govt ID matched against principal record") -- the platform records
 * which method was used and its reference; it does not run the check
 * itself.
 */
export class VerifyIdentityDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  method!: string;

  @ApiPropertyOptional({ description: "Reference number/id for the check performed, if any." })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
