import { ApiProperty } from "@nestjs/swagger";

/**
 * `/me/privacy-contact` response shape -- the organization's published
 * DPO / responsible-person contact (Rule 9 / s.8(9), checklist GO-10),
 * read from `Organization` via the tenant-scoped Prisma client so it is
 * always the CALLER's own organization, never one selected by an id in
 * the request.
 *
 * Deliberately exposes only the portal-safe organization identity, grievance
 * channel, privacy contact, and publication URL. It never returns
 * `Organization.id`, `settings`, or any other operational columns. The
 * service selects these explicit fields rather than serializing the row.
 *
 * `published: false` is a first-class state, not an absence encoded as
 * `""`: when the organization has configured neither a DPO nor a
 * responsible person, every other field is `null` and the portal is
 * expected to render its own explicit "not published yet" copy from
 * that, per the task brief ("say so cleanly... rather than returning an
 * empty string the UI would render as a blank").
 */
export class MePrivacyContactDto {
  @ApiProperty({ description: "The organization's public display name." })
  organizationName!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "The organization's legal name, when configured.",
  })
  legalName!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "The published grievance contact email, when configured.",
  })
  grievanceContactEmail!: string | null;

  @ApiProperty({
    description:
      "Whether the organization has published a DPO or responsible-person " +
      "contact (GO-10). When false every other field on this response is " +
      "null -- there is nothing published to show.",
  })
  published!: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "The published contact's name: the Data Protection Officer's name " +
      "if one is appointed, else the responsible person who can answer " +
      "questions about processing. Null when nothing is published.",
  })
  contactName!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "The published contact's email address. Null when nothing is " +
      "published.",
  })
  contactEmail!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "The published contact's phone number, when the organization has " +
      "published one for its DPO. Null when nothing is published, or " +
      "when the published contact is a responsible person rather than a " +
      "DPO (the schema carries no phone field for that case).",
  })
  contactPhone!: string | null;

  @ApiProperty({
    nullable: true,
    type: Boolean,
    description:
      "True when the published contact above is the Data Protection " +
      "Officer, false when it is the responsible person used because no " +
      "DPO is appointed, and null when nothing is published.",
  })
  isDpo!: boolean | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "Where the organization has published this contact (e.g. its " +
      "public privacy page), satisfying the GO-10 / RT-01 'published' " +
      "requirement. Null when nothing is published.",
  })
  publicPrivacyPageUrl!: string | null;
}
