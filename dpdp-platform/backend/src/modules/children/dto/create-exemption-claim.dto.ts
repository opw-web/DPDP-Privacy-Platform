import { IsIn, IsInt, IsString, Min, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Spec lines 217-248's own model comment gives the exact two literal
 * values (transcribed character for character, not "Fourth Schedule Part
 * B" -- the spec's fenced block really does shorten the second one to
 * just "Part B"):
 *   schedulePart String   // "Fourth Schedule Part A" | "Part B"
 */
export const SCHEDULE_PARTS = ["Fourth Schedule Part A", "Part B"] as const;

/**
 * CH-06/CH-07: a `ChildExemptionClaim` is never free text. All four
 * fields below are mandatory (the schema itself has no `?` on any of
 * them); the task brief calls out `schedulePart`, `scheduleRow`, and
 * `conditionText` by name as the three whose absence must 400, but
 * `justification` is equally NOT NULL in the schema and is validated the
 * same way -- there is no "we think this is exempt" free-text path
 * through this DTO for any of the four.
 */
export class CreateExemptionClaimDto {
  @ApiProperty({
    description: "The processing purpose this exemption is claimed against.",
  })
  @IsString()
  @MinLength(1)
  purposeId!: string;

  @ApiProperty({
    enum: SCHEDULE_PARTS,
    description: 'Fourth Schedule part. Exactly "Fourth Schedule Part A" or "Part B".',
  })
  @IsIn(SCHEDULE_PARTS)
  schedulePart!: string;

  @ApiProperty({ description: "The numbered row within that Schedule part." })
  @IsInt()
  @Min(1)
  scheduleRow!: number;

  @ApiProperty({
    description:
      "The condition text pasted verbatim from the Fourth Schedule, for " +
      "the record. Free-text justification alone (\"we think this is " +
      "exempt\") is not accepted -- this must be the actual Schedule wording.",
  })
  @IsString()
  @MinLength(1)
  conditionText!: string;

  @ApiProperty({
    description: "Why this purpose meets the pasted condition.",
  })
  @IsString()
  @MinLength(1)
  justification!: string;
}
