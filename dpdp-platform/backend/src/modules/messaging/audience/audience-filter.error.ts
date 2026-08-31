/**
 * Thrown by `compileAudience()` (see `compile-audience.ts`) for every kind
 * of malformed input: an unknown field, an unknown operator, nesting
 * beyond depth 2, a `consent` rule missing its `purposeId`, or a value
 * that does not fit the field's expected shape.
 *
 * Deliberately a plain `Error` subclass with NO `@nestjs/common` import --
 * `compileAudience` is a pure, framework-free function (spec line 749,
 * task brief) so it stays importable and unit-testable with no Nest
 * bootstrap. `AudienceController`/`AudienceService` is the one place that
 * knows this project's HTTP mapping and converts an
 * `AudienceFilterError` into a `BadRequestException`, mirroring
 * `TemplateRenderError` -> `BadRequestException` in
 * `templates.service.ts`.
 */
export class AudienceFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudienceFilterError";
  }
}
