import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class AffectedPrincipalsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  principalIds?: string[];
  @ApiPropertyOptional({
    description: "CSV containing one data-principal ID per row (first column).",
  })
  @IsOptional()
  @IsString()
  csv?: string;
  @ApiPropertyOptional({ description: "Audience compiler filter DSL." })
  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;
  @ApiPropertyOptional({
    description:
      "Select everyone with a field sourced from one of these systems.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceIds?: string[];
  @ApiPropertyOptional({
    description: "Return the preview without committing rows.",
  })
  @IsOptional()
  @IsBoolean()
  preview?: boolean;
}
