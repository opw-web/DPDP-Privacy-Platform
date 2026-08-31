import { IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class ListExemptionClaimsDto {
  @ApiPropertyOptional({
    description: "Filter to exemption claims for one processing purpose.",
  })
  @IsOptional()
  @IsString()
  purposeId?: string;
}
