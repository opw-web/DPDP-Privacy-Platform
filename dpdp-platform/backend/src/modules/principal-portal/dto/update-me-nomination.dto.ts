import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

const NOMINATION_SCOPES = [
  "ALL_RIGHTS",
  "ACCESS_ONLY",
  "ERASURE_ONLY",
] as const;
const NOMINATION_ACTIVATION = ["DEATH", "INCAPACITY", "BOTH"] as const;

export class UpdateMeNominationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  nomineeName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  nomineeEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nomineePhone?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  relationship!: string;

  @ApiProperty({ enum: NOMINATION_SCOPES })
  @IsIn(NOMINATION_SCOPES)
  scope!: (typeof NOMINATION_SCOPES)[number];

  @ApiProperty({ enum: NOMINATION_ACTIVATION })
  @IsIn(NOMINATION_ACTIVATION)
  activationCondition!: (typeof NOMINATION_ACTIVATION)[number];
}
