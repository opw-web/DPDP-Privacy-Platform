import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

const PRINCIPAL_REQUEST_TYPES = [
  "ACCESS",
  "CORRECTION",
  "ERASURE",
  "GRIEVANCE",
] as const;
export type PrincipalRequestType = (typeof PRINCIPAL_REQUEST_TYPES)[number];

export class CreateMeRequestDto {
  @ApiProperty({ enum: PRINCIPAL_REQUEST_TYPES })
  @IsIn(PRINCIPAL_REQUEST_TYPES)
  type!: PrincipalRequestType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  requestedChanges?: Record<string, unknown>;
}
