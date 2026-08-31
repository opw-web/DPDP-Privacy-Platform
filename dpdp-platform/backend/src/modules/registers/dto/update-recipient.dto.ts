import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { RecipientType } from "@prisma/client";

/**
 * Every field optional (PATCH semantics) -- a field left out of the body
 * is left unchanged by `RecipientsService.update()`.
 *
 * `RecipientsService.assertProcessorRule()` re-derives the EFFECTIVE
 * (existing + patched) `type`/`active`/`contractExists` and is the
 * authoritative check for s.8(2) -- a PATCH that flips `active` to true
 * on a contract-less processor, or flips `contractExists` to false on an
 * active processor, is rejected exactly like a bad POST would be. See
 * that method's doc comment.
 */
export class UpdateRecipientDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: RecipientType })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(RecipientType)
  type?: RecipientType;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  contractExists?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  contractReference?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString()
  contractSignedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString()
  contractExpiresAt?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  contractHasSecurityClause?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  contractHasErasureClause?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  contractHasAuditRights?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  subProcessorsDisclosed?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  subProcessorNotes?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}
