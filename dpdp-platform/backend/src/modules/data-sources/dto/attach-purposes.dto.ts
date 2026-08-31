import { ArrayUnique, IsArray, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * The request body for `PUT /api/data-sources/:id/purposes`: the COMPLETE
 * set of `ProcessingPurpose` ids attached to that source, replacing
 * whatever `DataSourcePurpose` rows existed before (task brief). An empty
 * array is valid and meaningful -- spec §4.3 / line 746: a source with no
 * purpose attached is legal to sync and must never be given a guessed
 * purpose, so "attach nothing" is not an error, it's the DPO's decision
 * not to declare one yet.
 */
export class AttachPurposesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  purposeIds!: string[];
}
