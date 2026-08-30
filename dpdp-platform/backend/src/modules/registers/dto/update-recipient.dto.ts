import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
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
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: RecipientType })
  @IsOptional()
  @IsEnum(RecipientType)
  type?: RecipientType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  contractHasSecurityClause?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  contractHasErasureClause?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  contractHasAuditRights?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  subProcessorsDisclosed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subProcessorNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
