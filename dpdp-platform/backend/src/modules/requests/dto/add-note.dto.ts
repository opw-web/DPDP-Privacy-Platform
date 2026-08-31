import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

/** `POST /api/requests/:ref/note`. Does not change status. */
export class AddNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  note!: string;

  @ApiPropertyOptional({
    description:
      "Whether this note appears on the Data Principal's own timeline. Defaults to false.",
  })
  @IsOptional()
  @IsBoolean()
  visibleToPrincipal?: boolean;
}
