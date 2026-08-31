import { ArrayMinSize, ArrayUnique, IsArray, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * `POST /api/notices`: creates the notice "shell" -- the `PrivacyNotice`
 * row -- with no content of its own. Content (the itemised data list,
 * purpose statements, body, links) lives on `NoticeVersion` rows created
 * afterwards via `POST /api/notices/:id/versions`.
 *
 * `code` carries the notice's category, e.g. `ACCOUNT_SIGNUP`,
 * `MARKETING_OPTIN`, or `LEGACY_CONSENT` (s.5(2), NT-09 -- for consent
 * obtained before the Act commenced). `LEGACY_CONSENT` is not a separate
 * model or a separate endpoint: it is simply this `code` value, so any
 * organization mints one the same way as any other notice.
 *
 * `purposeIds` is required and non-empty: a notice with no purpose behind
 * it cannot contribute a purpose statement (Rule 3(b)(ii)) or an itemised
 * data list (Rule 3(b)(i), pulled from the `SourceFieldMapping` rows
 * attached to these purposes) at all.
 */
export class CreateNoticeDto {
  @ApiProperty({
    description:
      'Category code, e.g. "ACCOUNT_SIGNUP", "MARKETING_OPTIN", ' +
      '"LEGACY_CONSENT" (s.5(2), NT-09). Unique per organization.',
  })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    type: [String],
    description:
      "The ProcessingPurpose ids this notice covers. Cannot be empty -- " +
      "every itemised data field and purpose statement in every version " +
      "of this notice is pulled from these purposes.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  purposeIds!: string[];
}
