import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { AuthType, SyncFrequency } from "@prisma/client";

/**
 * Every field optional (PATCH semantics) -- a field left out of the body
 * is left unchanged by `DataSourcesService.update()`.
 *
 * `credential` is the ONE field on this DTO that does not mean "set the
 * stored value to this" in the usual PATCH sense: leaving it out (or
 * never even prefilling it -- this API never sends the existing
 * credential back, see Check 14) keeps the existing encrypted credential
 * untouched. Sending it triggers a rotation: a new value is encrypted,
 * `credentialHint` is recomputed, and
 * `DATA_SOURCE_CREDENTIALS_ROTATED` is audited. `@MinLength(1)` means an
 * accidental blank string in the body is a 400, not a silent rotation to
 * an empty credential.
 */
export class UpdateDataSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  systemType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  baseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordsPath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  externalIdField?: string;

  @ApiPropertyOptional({ enum: AuthType })
  @IsOptional()
  @IsEnum(AuthType)
  authType?: AuthType;

  @ApiPropertyOptional({
    description:
      "Sending a value ROTATES the credential (audited as " +
      "DATA_SOURCE_CREDENTIALS_ROTATED). Omitting it keeps the existing " +
      "one. This field is write-only -- no response ever echoes it back.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  credential?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  supportsIncremental?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incrementalParam?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paginationStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({ enum: SyncFrequency })
  @IsOptional()
  @IsEnum(SyncFrequency)
  syncFrequency?: SyncFrequency;

  @ApiPropertyOptional({
    description:
      "SC-03. A human legal determination this platform records, never " +
      "concludes on its own.",
  })
  @IsOptional()
  @IsBoolean()
  containsOnlyPubliclyAvailableData?: boolean;

  @ApiPropertyOptional({
    description:
      "Required (and must be non-blank) whenever the EFFECTIVE " +
      "(existing + this patch) containsOnlyPubliclyAvailableData is true.",
  })
  @IsOptional()
  @IsString()
  publiclyAvailableJustification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hostingCountry?: string;
}
