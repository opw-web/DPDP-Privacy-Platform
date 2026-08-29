import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ResetEmployeePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
