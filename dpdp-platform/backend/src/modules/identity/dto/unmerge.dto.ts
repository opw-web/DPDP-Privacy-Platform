import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

/**
 * `POST /api/principals/:id/unmerge` body (spec line 827). `reason` is
 * required and non-empty: `IdentityLink.detachReason` exists precisely so
 * a reversal always carries a human-readable justification, never a
 * silent detach.
 */
export class UnmergeDto {
  @ApiProperty({
    description: "The normalized record to detach from this principal.",
  })
  @IsString()
  @MinLength(1)
  normalizedRecordId!: string;

  @ApiProperty({ description: "Why this record does not belong here." })
  @IsString()
  @MinLength(1)
  reason!: string;
}
