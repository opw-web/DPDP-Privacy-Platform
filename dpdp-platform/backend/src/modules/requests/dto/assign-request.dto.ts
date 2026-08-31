import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

/** `POST /api/requests/:ref/assign`. */
export class AssignRequestDto {
  @ApiProperty({ description: "The employee id to assign this request to." })
  @IsString()
  @MinLength(1)
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
