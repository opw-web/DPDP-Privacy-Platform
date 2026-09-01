import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class AddMeRequestCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  comment!: string;
}
