import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SystemChecklistTickDto {
  @ApiProperty()
  @IsString()
  dataSourceId!: string;

  @ApiProperty()
  @IsBoolean()
  done!: boolean;
}

export class ProcessorChecklistTickDto {
  @ApiProperty()
  @IsString()
  recipientId!: string;

  @ApiProperty()
  @IsBoolean()
  confirmed!: boolean;

  @ApiPropertyOptional({ description: "Confirmation reference, e.g. the processor's own ticket/email reference." })
  @IsOptional()
  @IsString()
  ref?: string;
}

/**
 * `POST /api/retention/tasks/:id/complete` body -- the full,
 * final checklist tick state, submitted once. There is no separate
 * "tick one item" endpoint (spec lines 859-862 name exactly four
 * retention routes), so the frontend collects every tick client-side and
 * submits the whole checklist here; `ErasureTaskService.complete`
 * rejects the request if any non-excluded entry is missing or not
 * ticked.
 */
export class CompleteErasureTaskDto {
  @ApiProperty({ type: [SystemChecklistTickDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SystemChecklistTickDto)
  systemChecklist!: SystemChecklistTickDto[];

  @ApiProperty({ type: [ProcessorChecklistTickDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessorChecklistTickDto)
  processorChecklist!: ProcessorChecklistTickDto[];
}
