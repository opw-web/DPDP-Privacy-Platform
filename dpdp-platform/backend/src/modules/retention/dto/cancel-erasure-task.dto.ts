import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CancelErasureTaskDto {
  @ApiProperty({ description: "Recorded verbatim on the task as cancelledReason." })
  @IsString()
  @MinLength(1)
  reason!: string;
}
