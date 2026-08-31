import { IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * `filter` is the DSL group at DPDP_MVP2_COMPLIANCE_OPERATIONS.md
 * §4.7 lines 728-745 -- `{ "op": "AND"|"OR", "rules": [...] }`, arbitrarily
 * nested rules and sub-groups. class-validator has no ergonomic way to
 * validate this recursive, union-shaped structure (a rule vs. a nested
 * group; eleven different field/value shapes), so it is accepted here as
 * an open object and validated field-by-field, operator-by-operator, and
 * depth-by-depth by `compileAudience()` itself -- the ONE place that
 * validation must live, per the spec's "never silently ignored"
 * requirement (line 747). A malformed `filter` throws `AudienceFilterError`
 * inside the service, mapped to a 400 there, not here.
 *
 * `purposeId` is optional and independent of any `consent` rule that may
 * appear inside `filter` (a `consent` rule targets who is IN the
 * audience; this `purposeId` is what `suppressedByConsent` in the
 * response is computed against -- see `audience.service.ts`'s doc
 * comment for why the two are deliberately different knobs).
 */
export class PreviewAudienceDto {
  @ApiProperty({
    description:
      'Audience filter DSL group: { "op": "AND"|"OR", "rules": [...] }. See §4.7.',
    type: "object",
  })
  @IsObject()
  filter!: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "Marketing purpose to compute suppressedByConsent against (the same purposeId a MARKETING campaign built on this audience would require).",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  purposeId?: string;
}
