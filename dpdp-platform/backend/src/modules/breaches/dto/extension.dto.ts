import { IsDateString, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ExtensionDto {
  @ApiProperty() @IsDateString() requestedAt!: string;
  @ApiProperty({
    description: "The date granted by the Board for the detailed information.",
  })
  @IsDateString()
  grantedUntil!: string;
  @ApiProperty() @IsString() @MinLength(1) reference!: string;
}
