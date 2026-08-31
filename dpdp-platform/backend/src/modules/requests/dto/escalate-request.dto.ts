import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/** `POST /api/requests/:ref/escalate`. */
export class EscalateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
