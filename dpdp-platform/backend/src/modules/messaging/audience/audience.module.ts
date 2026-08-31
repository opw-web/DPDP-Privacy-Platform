import { Module } from "@nestjs/common";
import { MaskingModule } from "../../../common/masking/masking.module";
import { AudienceController } from "./audience.controller";
import { AudienceService } from "./audience.service";

/**
 * There is no `messaging.module.ts` (Ruling 2, progress.md) -- like
 * `templates.module.ts`, this registers directly in `app.module.ts`,
 * the integrator's job, not this task's.
 *
 * `compileAudience` (in `compile-audience.ts`) is exported directly from
 * this directory, NOT through `AudienceService` -- Task 11 imports the
 * bare function for the campaign send path, per the task brief
 * ("Task 11 will be told to import your function rather than
 * reimplement the query"). This module only wires the HTTP preview
 * endpoint around it.
 */
@Module({
  imports: [MaskingModule],
  controllers: [AudienceController],
  providers: [AudienceService],
  exports: [AudienceService],
})
export class AudienceModule {}
