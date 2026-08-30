import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DataCategory } from "@prisma/client";

/**
 * `description` is REQUIRED, not optional -- s.11(1)(b) obliges the
 * company to be able to produce "a description of the personal data so
 * shared", so a `SharingActivity` with no description cannot exist
 * (task brief). `dataCategories`, `sourceIds`, `purposeId` and
 * `recipientId` are likewise required (task brief's own list) --
 * `sourceIds` is the array Task 20 intersects per principal to answer
 * "which recipients hold THIS person's data", so it is verified against
 * real `DataSource` ids for this organization in
 * `SharingService.create()`, not merely shaped as `string[]` here.
 */
export class CreateSharingActivityDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  recipientId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  purposeId!: string;

  @ApiProperty({ enum: DataCategory, isArray: true })
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories!: DataCategory[];

  @ApiProperty({
    description:
      'The "description of the personal data so shared" s.11(1)(b) ' +
      "obliges the company to produce. Cannot be blank.",
  })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty({
    type: [String],
    description:
      "Which DataSource ids feed this sharing -- consumed by Task 20 to " +
      "answer which recipients hold a given principal's data.",
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  sourceIds!: string[];

  @ApiProperty()
  @IsDateString()
  startedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
