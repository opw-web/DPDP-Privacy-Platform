import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { EntityRole, ThirdScheduleClass } from "@prisma/client";

/**
 * All optional -- this is a partial-update DTO. `OrganizationsService.update`
 * splits the fields actually present into three buckets (general settings,
 * SDF self-declaration, Third Schedule self-declaration) and writes a
 * distinct audit action for each bucket that has anything in it, per the
 * task brief ("Org changes write ORG_SETTINGS_UPDATED; the SDF and Third
 * Schedule fields write SDF_STATUS_DECLARED and
 * THIRD_SCHEDULE_CLASS_DECLARED").
 */
export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ enum: EntityRole })
  @IsOptional()
  @IsEnum(EntityRole)
  entityRole?: EntityRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offersGoodsServicesInIndia?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dpoName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  dpoEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dpoPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dpoIsIndiaBased?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsiblePersonName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  responsiblePersonEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  grievanceContactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  publicPrivacyPageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  // ── SDF self-declaration (spec: never inferred, always a human's declaration) ──
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSignificantDataFiduciary?: boolean;

  @ApiPropertyOptional({
    description:
      "ISO date string in the request body -- converted to a Date in the service before it reaches Prisma.",
  })
  @IsOptional()
  @IsDateString()
  sdfNotifiedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sdfNotificationRef?: string;

  // ── Third Schedule self-declaration ──
  @ApiPropertyOptional({ enum: ThirdScheduleClass })
  @IsOptional()
  @IsEnum(ThirdScheduleClass)
  thirdScheduleClass?: ThirdScheduleClass;

  @ApiPropertyOptional({
    description:
      "Plain number in the request body -- converted to BigInt in the service before it reaches Prisma.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  registeredUserCount?: number;
}
