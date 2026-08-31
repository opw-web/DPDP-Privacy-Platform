import { ApiProperty } from "@nestjs/swagger";

/**
 * Documents the one field `MeService.getProfile` adds on top of
 * `PrincipalsService.getUnmaskedProfile`'s own (otherwise undecorated)
 * shape: `organizationTimezone`. That underlying shape belongs to the
 * `principals` module and is intentionally not re-declared here --
 * duplicating it would drift the moment that module's profile fields
 * change, and this module owns none of that code.
 *
 * `MeController.profile()` composes this DTO with a generic "plus other
 * properties" object schema (`allOf` + `additionalProperties: true`) so
 * `/api/docs` is accurate about this addition without falsely implying
 * the response is limited to just this one field.
 */
export class MeProfileTimezoneDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "IANA timezone of the calling principal's OWN organization (e.g. " +
      "'Asia/Kolkata'), read from Organization.timezone via the tenant-" +
      "scoped Prisma client -- resolved from the caller's verified " +
      "access token, never from a path/query/body parameter, so it can " +
      "never be another organization's zone. Global constraint #7: " +
      "timestamps are stored as UTC everywhere and converted to the " +
      "organization's own timezone exactly once, at the render boundary " +
      "-- this is the field the portal's shared <DateTime> component " +
      "renders every /api/me/* timestamp with. Null when the " +
      "organization has no timezone configured -- never an empty " +
      "string, which the portal would otherwise treat as a valid IANA " +
      "zone and silently render every timestamp in UTC.",
  })
  organizationTimezone!: string | null;
}
