import { IsObject, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * `variables` is an open `{ [name]: string }` map at the HTTP boundary --
 * class-validator has no ergonomic way to validate an arbitrary map's
 * VALUES are all strings, so `TemplatesService.preview` does that check
 * itself before rendering. Whether a KEY is one of the whitelisted names
 * is enforced by the renderer, not here: an extra key the template
 * doesn't reference is harmless and simply unused.
 *
 * `dpo_name`/`dpo_contact` entries here are accepted by validation but
 * always OVERRIDDEN by the organization record before rendering (RT-16)
 * -- see `renderOrganizationMessageTemplate`. Preview deliberately does
 * not special-case them out of the DTO so a caller can see, in the
 * response, that its own values were ignored.
 */
export class PreviewTemplateDto {
  @ApiPropertyOptional({
    type: "object",
    additionalProperties: { type: "string" },
    description: "Values for the whitelisted variables the template uses.",
  })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
