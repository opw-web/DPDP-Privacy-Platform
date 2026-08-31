import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

/**
 * `POST /api/requests/:ref/flag-frivolous` (RT-15). A flag with a
 * reason, never an auto-reject -- the request still runs its course.
 */
export class FlagFrivolousDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;
}
