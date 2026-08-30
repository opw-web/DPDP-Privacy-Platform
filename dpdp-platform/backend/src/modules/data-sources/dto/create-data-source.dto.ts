import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AuthType, SyncFrequency } from "@prisma/client";

/**
 * There is deliberately NO `credentialCipher` field anywhere on this DTO,
 * on `UpdateDataSourceDto`, or on the response shape
 * (`DATA_SOURCE_PUBLIC_SELECT` in `data-sources.service.ts`). `credential`
 * below is the ONLY way a secret ever enters this module, and it is
 * encrypted before it touches the database -- see
 * `DataSourcesService.create()`.
 */
export class CreateDataSourceDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    description: 'Free-text label for the source system, e.g. "Shopify".',
  })
  @IsString()
  @MinLength(1)
  systemType!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  baseUrl!: string;

  @ApiProperty({
    description: 'Dot-separated JSON path to the record array, e.g. "data".',
  })
  @IsString()
  recordsPath!: string;

  @ApiProperty({ description: "That system's primary key field name." })
  @IsString()
  @MinLength(1)
  externalIdField!: string;

  @ApiPropertyOptional({ enum: AuthType, default: "BEARER" })
  @IsOptional()
  @IsEnum(AuthType)
  authType?: AuthType;

  @ApiPropertyOptional({
    description:
      "Plaintext credential (bearer token, API key, or basic-auth " +
      "'user:pass'). Encrypted with AES-256-GCM before storage; only its " +
      "last 4 characters (as `credentialHint`) and never this value are " +
      "ever returned by any endpoint.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  credential?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  supportsIncremental?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incrementalParam?: string;

  @ApiPropertyOptional({
    default: "PAGE",
    description: 'MVP1 supports "PAGE" only.',
  })
  @IsOptional()
  @IsString()
  paginationStyle?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({ enum: SyncFrequency, default: "MANUAL" })
  @IsOptional()
  @IsEnum(SyncFrequency)
  syncFrequency?: SyncFrequency;

  @ApiPropertyOptional({
    default: false,
    description:
      "SC-03. A human legal determination this platform records, never " +
      "concludes on its own -- see `publiclyAvailableJustification`.",
  })
  @IsOptional()
  @IsBoolean()
  containsOnlyPubliclyAvailableData?: boolean;

  @ApiPropertyOptional({
    description:
      "Required (and must be non-blank) when " +
      "`containsOnlyPubliclyAvailableData` is true.",
  })
  @IsOptional()
  @IsString()
  publiclyAvailableJustification?: string;

  @ApiPropertyOptional({ default: "IN" })
  @IsOptional()
  @IsString()
  hostingCountry?: string;
}
