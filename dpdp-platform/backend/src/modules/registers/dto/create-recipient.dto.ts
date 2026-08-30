import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { RecipientType } from "@prisma/client";

/**
 * `DataRecipient` has `@@unique([organizationId, name])` -- `name`
 * duplicates are pre-checked and P2002-caught into a 409 by
 * `RecipientsService.create()`, same convention as
 * `data-sources.service.ts`'s `duplicateNameMessage`.
 *
 * There is deliberately no request-level enforcement here of s.8(2) (a
 * DATA_PROCESSOR cannot be `active` without `contractExists`) --
 * `class-validator` decorators see only THIS object, never the
 * combination of `type`/`active`/`contractExists` together, so that rule
 * is checked once, authoritatively, in
 * `RecipientsService.assertProcessorRule()` against the values about to
 * be written (same discipline as `PurposesService.validateBasis()`).
 */
export class CreateRecipientDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: RecipientType })
  @IsEnum(RecipientType)
  type!: RecipientType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ default: "IN" })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      "s.8(2): a DATA_PROCESSOR may be engaged only under a valid " +
      "contract. Required (with `active: true`) for a DATA_PROCESSOR.",
  })
  @IsOptional()
  @IsBoolean()
  contractExists?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  contractSignedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  contractExpiresAt?: string;

  @ApiPropertyOptional({
    default: false,
    description: "Rule 6(1)(f): security safeguard provisions in the contract.",
  })
  @IsOptional()
  @IsBoolean()
  contractHasSecurityClause?: boolean;

  @ApiPropertyOptional({ default: false, description: "s.8(7)(b)." })
  @IsOptional()
  @IsBoolean()
  contractHasErasureClause?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  contractHasAuditRights?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  subProcessorsDisclosed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subProcessorNotes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
