import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * PATCH semantics: a field left out is left unchanged. `code` and
 * `category` are deliberately NOT patchable -- changing either would
 * silently repoint whatever else (a campaign, a breach obligation)
 * looked the template up by `[organizationId, code]`.
 *
 * `acknowledgeBreachElementRemoval`: required (`true`) to save an edit
 * to a `BREACH_NOTICE`-category template that would remove one or more
 * of the six Rule 7(1)/responder-contact placeholders it currently
 * contains (see `BREACH_NOTIFICATION_REQUIRED_ELEMENTS`). Omitting it
 * (or leaving it `false`) on such an edit is rejected with a 409 naming
 * exactly which placeholder(s) would be removed; supplying `true`
 * applies the edit AND records the acknowledgement on the audit event
 * (`TemplatesService.update`). Ignored for any other template.
 */
export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: "May itself contain whitelisted {{variables}}." })
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @ApiPropertyOptional({
    description: "Markdown only, never raw HTML.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyMarkdown?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  requiredVariables?: string[];

  @ApiPropertyOptional({
    description:
      "Must be true to save an edit that removes one or more of the " +
      "six mandatory BREACH_NOTICE placeholders. Recorded on the audit " +
      "event when used.",
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeBreachElementRemoval?: boolean;
}
