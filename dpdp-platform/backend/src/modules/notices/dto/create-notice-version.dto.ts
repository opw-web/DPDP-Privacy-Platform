import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * One ticked itemised-data-field row (Rule 3(b)(i)). `sourceFieldMappingId`
 * must reference an MVP 1 `SourceFieldMapping` row whose `DataSource` is
 * attached, via `DataSourcePurpose`, to at least one purpose this notice
 * covers -- `NoticesService.createVersion()` is the sole enforcement
 * point for that; there is no decorator here that can check a foreign
 * table.
 *
 * `label` is the human-facing text shown to the Data Principal for this
 * field (e.g. "Your date of birth"). It is optional: when omitted, the
 * service derives a plain-English label from `canonicalField` (e.g.
 * `DATE_OF_BIRTH` -> "Date of birth") so a notice is never blocked on
 * copywriting, but an admin composing the notice can always override it.
 */
export class ItemisedFieldInputDto {
  @ApiProperty({
    description: "The SourceFieldMapping id this itemised row is pulled from.",
  })
  @IsString()
  @MinLength(1)
  sourceFieldMappingId!: string;

  @ApiPropertyOptional({
    description:
      "Human-facing label shown to the Data Principal. Defaults to a " +
      "plain-English rendering of canonicalField when omitted.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;
}

/**
 * `POST /api/notices/:id/versions`: creates the next `NoticeVersion` for
 * a notice (version numbers are gap-free per notice, assigned by the
 * service -- never supplied by the caller). This is also how an existing
 * published notice is "edited": a published `NoticeVersion` is frozen by
 * the `notice_frozen` DB trigger, so the only way to change wording is a
 * brand new version created through this endpoint, then published
 * through `POST /api/notices/:id/versions/:v/publish`.
 *
 * `itemisedDataFields`, `withdrawalUrl`, `rightsUrl` and
 * `boardComplaintUrl` are all OPTIONAL here even though their columns are
 * `NOT NULL` in the schema -- the version can be created as an
 * incomplete draft (an empty itemised list, blank links) and iterated on
 * before publication. `NoticeVersion.itemisedDataFields`/`withdrawalUrl`/
 * `rightsUrl`/`boardComplaintUrl` are `[]`/`""` respectively for anything
 * omitted here; `NoticesService.publish()` is what enforces Rule
 * 3(b)(i)/3(c) completeness and blocks publication (not creation) when
 * they are missing.
 */
export class CreateNoticeVersionDto {
  @ApiProperty({
    description:
      "The standalone notice body (Rule 3(a)): understandable with " +
      "nothing else on the page.",
  })
  @IsString()
  @MinLength(1)
  bodyMarkdown!: string;

  @ApiPropertyOptional({
    type: [ItemisedFieldInputDto],
    description:
      "The itemised personal data fields ticked for this version " +
      "(Rule 3(b)(i)). Cannot be empty at publication time.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemisedFieldInputDto)
  itemisedDataFields?: ItemisedFieldInputDto[];

  @ApiPropertyOptional({
    description: "Rule 3(c): where consent, once given, can be withdrawn.",
  })
  @IsOptional()
  @IsUrl()
  withdrawalUrl?: string;

  @ApiPropertyOptional({
    description: "Rule 3(c): where the Data Principal's rights are exercised.",
  })
  @IsOptional()
  @IsUrl()
  rightsUrl?: string;

  @ApiPropertyOptional({
    description: "Rule 3(c): where a complaint to the Board is lodged.",
  })
  @IsOptional()
  @IsUrl()
  boardComplaintUrl?: string;
}
