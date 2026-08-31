import { IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class ListGuardiansDto {
  @ApiPropertyOptional({
    description: "Filter to guardian relationships for one data principal.",
  })
  @IsOptional()
  @IsString()
  dataPrincipalId?: string;
}
