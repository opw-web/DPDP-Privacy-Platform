import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { EmployeeStatus } from "@prisma/client";

export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @ApiPropertyOptional({
    description:
      "Must be a Role belonging to the current organization -- resolved through the tenant-scoped delegate before use.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  roleId?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}
