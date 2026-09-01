import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MessageCategory } from "@prisma/client";

/**
 * `POST /api/campaigns` (§4.8, §4.13 line 869: `CAN_SEND_MESSAGES`).
 *
 * Deliberately does NOT use `@ValidateIf` to conditionally require
 * `purposeId` (MARKETING/CONSENT_REQUEST), `noticeId` (CONSENT_REQUEST)
 * or `breachId` (BREACH_NOTICE) -- Nest's global `ValidationPipe` runs
 * BEFORE `CampaignsService` ever sees the request, so a
 * `@ValidateIf`-conditional requirement would turn a domain error a
 * guard is supposed to raise (e.g. "MARKETING requires purposeId", spec
 * §4.8 guard 1) into a premature 400 from a validator that never
 * consulted the guard at all -- the exact bug class Task 6 shipped once
 * (`ChangeStatusDto`'s own doc comment) and this project's brief
 * explicitly warns Task 11 is "the prime candidate for" again.
 * `CampaignsService.create()` re-derives and enforces every one of these
 * per-category requirements itself, in guard order, where the ordering
 * is under this service's own control.
 */
export class CreateCampaignDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: MessageCategory })
  @IsEnum(MessageCategory)
  category!: MessageCategory;

  @ApiPropertyOptional({
    description:
      "An existing MessageTemplate to snapshot subject/bodyMarkdown/" +
      "requiredVariables from at creation time. Either this or " +
      "(subject AND bodyMarkdown) is required -- service-enforced.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  templateId?: string;

  @ApiPropertyOptional({
    description:
      "Ad-hoc subject, only used when templateId is omitted. May itself " +
      "contain whitelisted {{variables}}.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @ApiPropertyOptional({
    description:
      "Ad-hoc body markdown, only used when templateId is omitted.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyMarkdown?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Only consulted when templateId is omitted -- a template's own " +
      "requiredVariables win when templateId is supplied.",
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  requiredVariables?: string[];

  @ApiPropertyOptional({
    description:
      'Audience filter DSL group: { "op": "AND"|"OR", "rules": [...] } ' +
      "(§4.7). Required for every category except BREACH_NOTICE, whose " +
      "recipients come only from BreachAffectedPrincipal (guard 3) -- " +
      "service-enforced, never accepted for BREACH_NOTICE.",
    type: "object",
  })
  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "Required for MARKETING (guard 1) and CONSENT_REQUEST (guard 4). " +
      "Service-enforced.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  purposeId?: string;

  @ApiPropertyOptional({
    description:
      "Required for CONSENT_REQUEST (guard 4) -- resolved via " +
      "NoticesService.getPublishedVersion(noticeId) into the campaign's " +
      "frozen noticeVersionId; refused (NT-01) if that notice has no " +
      "published version. Service-enforced.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  noticeId?: string;

  @ApiPropertyOptional({
    description:
      "Required for BREACH_NOTICE (guard 3). Service-enforced.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  breachId?: string;
}
