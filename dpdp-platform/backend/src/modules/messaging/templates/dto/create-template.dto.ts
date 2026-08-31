import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MessageCategory } from "@prisma/client";

/**
 * `variables` is deliberately NOT a field on this DTO -- it is always
 * derived by `TemplatesService` from parsing `subject`/`bodyMarkdown`
 * (see `extractTemplateVariables`), which is also the point the closed
 * whitelist is enforced (an unwhitelisted `{{...}}` fails creation
 * outright, before the template can ever be saved or sent). A caller
 * cannot claim a variable set that doesn't match what the template text
 * actually references.
 */
export class CreateTemplateDto {
  @ApiProperty({ description: "Unique per organization, e.g. NOTICE_STANDARD." })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: MessageCategory })
  @IsEnum(MessageCategory)
  category!: MessageCategory;

  @ApiProperty({ description: "May itself contain whitelisted {{variables}}." })
  @IsString()
  @MinLength(1)
  subject!: string;

  @ApiProperty({
    description:
      "Markdown only, never raw HTML. May contain whitelisted " +
      "{{variables}} as plain, escaped mustache references.",
  })
  @IsString()
  @MinLength(1)
  bodyMarkdown!: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Subset of the variables actually referenced in subject/" +
      "bodyMarkdown that must have a non-empty value at render time.",
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  requiredVariables?: string[];
}
