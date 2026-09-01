import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CompleteObligationDto {
  @ApiPropertyOptional({ enum: ["DONE", "WAIVED"] })
  @IsOptional()
  @IsIn(["DONE", "WAIVED"])
  status?: "DONE" | "WAIVED";
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  evidenceReference?: string;
  @ApiPropertyOptional({ description: "Required when status is WAIVED." })
  @IsOptional()
  @IsString()
  @MinLength(1)
  waiverReason?: string;
}
