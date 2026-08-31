import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DataCategory, LawfulBasis, LegitimateUseLimb } from "@prisma/client";

/**
 * `lawfulBasis` and `basisJustification` are marked required with no
 * `@IsOptional()` and no default value anywhere in this class -- omitting
 * either fails `@IsEnum`/`@IsString` at the `ValidationPipe` layer before
 * the request ever reaches `PurposesService`. That first line of defence
 * is NOT the authoritative one, though (spec's own warning: a DTO
 * decorator is something a later refactor could drop without anyone
 * noticing). `PurposesService.validateBasis()` re-checks every one of
 * these rules independently against the actual values it is about to
 * write, and is what the tests assert against by message content -- see
 * that method's doc comment for why.
 *
 * There is deliberately no `dataSourceId`, `tableName`, or similar field
 * anywhere on this DTO: a purpose is created by a human naming a purpose,
 * never by pointing at a table (LB-02). Do not add one.
 */
export class CreatePurposeDto {
  @ApiProperty({
    description: "Unique per organization, e.g. ORDER_FULFILMENT.",
  })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    description: "Plain language description, reused in notices (MVP 2).",
  })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty({
    enum: LawfulBasis,
    description:
      "REQUIRED. Never defaulted, never inferred from a data source, " +
      "table, or column name (LB-02).",
  })
  @IsEnum(LawfulBasis)
  lawfulBasis!: LawfulBasis;

  @ApiPropertyOptional({
    enum: LegitimateUseLimb,
    description:
      "The s.7(a)-(i) limb. Required when lawfulBasis is LEGITIMATE_USE; " +
      "must be omitted when lawfulBasis is CONSENT.",
  })
  @IsOptional()
  @IsEnum(LegitimateUseLimb)
  legitimateUseLimb?: LegitimateUseLimb;

  @ApiProperty({
    description:
      "Free text written by a human explaining why this basis applies. " +
      "Cannot be blank or whitespace-only.",
  })
  @IsString()
  @MinLength(1)
  basisJustification!: string;

  @ApiPropertyOptional({
    enum: DataCategory,
    isArray: true,
    description: "What is necessary for this purpose (CN-02).",
  })
  @IsOptional()
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories?: DataCategory[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goodsOrServicesDescription?: string;
}
