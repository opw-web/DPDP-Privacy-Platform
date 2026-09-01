import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DataCategory } from "@prisma/client";

export class CreateBreachDto {
  @ApiProperty() @IsString() @MinLength(1) title!: string;
  @ApiProperty() @IsString() @MinLength(1) description!: string;
  @ApiProperty({
    description: "When the incident occurred; distinct from becameAwareAt.",
  })
  @IsDateString()
  occurredAt!: string;
  @ApiProperty({
    description:
      "When the fiduciary became aware; every obligation clock starts here.",
  })
  @IsDateString()
  becameAwareAt!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  affectedSourceIds!: string[];
  @ApiProperty({ enum: DataCategory, isArray: true })
  @IsArray()
  @IsEnum(DataCategory, { each: true })
  dataCategories!: DataCategory[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedPrincipalIds?: string[];
  @ApiPropertyOptional({
    description: "CSV payload whose first column contains principal IDs.",
  })
  @IsOptional()
  @IsString()
  csv?: string;
  @ApiPropertyOptional({
    description: "Audience compiler filter used to select affected principals.",
  })
  @IsOptional()
  audienceFilter?: Record<string, unknown>;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  natureExtentTiming?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  consequences?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  mitigationMeasures?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  safetyMeasuresForPrincipals?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  responderContact?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  boardBroadFacts?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  boardMitigation?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  boardPerpetratorFindings?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  boardRemedialMeasures?: string;
}
