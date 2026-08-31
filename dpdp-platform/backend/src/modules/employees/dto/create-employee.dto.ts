import { IsEmail, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateEmployeeDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiProperty({
    description:
      "Must be a Role belonging to the current organization -- resolved through the tenant-scoped delegate before use, never trusted as-is.",
  })
  @IsString()
  @MinLength(1)
  roleId!: string;

  @ApiProperty({
    description:
      "Initial password, set directly by an admin (no invite-email flow in MVP 1).",
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
