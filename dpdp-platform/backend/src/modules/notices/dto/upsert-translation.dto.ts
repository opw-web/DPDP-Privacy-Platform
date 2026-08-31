import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * `PUT /api/notices/:id/versions/:v/translations/:lang`: stores a
 * human-authored translation of a `NoticeVersion.bodyMarkdown`. `:lang`
 * (the path param) carries the language code, validated against
 * `NOTICE_LANGUAGE_CODES` by `NoticesService`, not here.
 *
 * There is deliberately no field here that could trigger machine
 * translation -- the platform stores and serves what a human gives it,
 * and never calls a translation API itself.
 */
export class UpsertTranslationDto {
  @ApiProperty({ description: "Human-authored translated body." })
  @IsString()
  @MinLength(1)
  bodyMarkdown!: string;
}
