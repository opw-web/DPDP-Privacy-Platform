import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../../common/audit/audit.service";
import { CreateTemplateDto } from "./dto/create-template.dto";
import { UpdateTemplateDto } from "./dto/update-template.dto";
import { PreviewTemplateDto } from "./dto/preview-template.dto";
import {
  BREACH_NOTIFICATION_REQUIRED_ELEMENTS,
  TemplateVariableName,
} from "./whitelisted-variables";
import {
  DisallowedTemplateSyntaxError,
  MissingOrganizationContactError,
  MissingRequiredVariableError,
  RenderedTemplate,
  TemplateRenderError,
  UnknownTemplateVariableError,
  extractTemplateVariables,
  renderOrganizationMessageTemplate,
} from "./template-renderer";

/**
 * The only shape of `MessageTemplate` this service (or the controller
 * behind it) ever returns -- same discipline as `PURPOSE_PUBLIC_SELECT`.
 */
export const MESSAGE_TEMPLATE_PUBLIC_SELECT = {
  id: true,
  code: true,
  name: true,
  category: true,
  subject: true,
  bodyMarkdown: true,
  variables: true,
  requiredVariables: true,
  isSystem: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MessageTemplateSelect;

export type PublicMessageTemplate = Prisma.MessageTemplateGetPayload<{
  select: typeof MESSAGE_TEMPLATE_PUBLIC_SELECT;
}>;

/**
 * Converts a `TemplateRenderError` (thrown by `template-renderer.ts`,
 * which is deliberately framework-agnostic so task 11/14 can call it
 * outside an HTTP request too) into the Nest HTTP exception this
 * controller surfaces. `MissingOrganizationContactError` and validation
 * failures both become 400s -- there is no partial-success status here,
 * the render either fully succeeds or is fully refused.
 */
function toBadRequest(err: unknown): never {
  if (err instanceof TemplateRenderError) {
    throw new BadRequestException(err.message);
  }
  throw err;
}

function duplicateCodeMessage(code: string): string {
  return `A message template with code "${code}" already exists in this organization.`;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicMessageTemplate[]> {
    return this.prisma.scoped.messageTemplate.findMany({
      orderBy: [{ code: "asc" }],
      select: MESSAGE_TEMPLATE_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicMessageTemplate> {
    const found = await this.prisma.scoped.messageTemplate.findFirst({
      where: { id },
      select: MESSAGE_TEMPLATE_PUBLIC_SELECT,
    });
    if (!found) {
      throw new NotFoundException(`Message template "${id}" not found.`);
    }
    return found;
  }

  /**
   * Parses `subject`+`bodyMarkdown` and returns the variables actually
   * referenced -- throwing `BadRequestException` (mapped from the
   * renderer's own errors) the moment the text references anything
   * outside the closed whitelist or uses disallowed Handlebars syntax.
   * This is the fail-fast enforcement point: an out-of-whitelist
   * template can never be saved, let alone sent.
   */
  private extractAndValidateVariables(
    subject: string,
    bodyMarkdown: string,
  ): TemplateVariableName[] {
    try {
      const subjectVars = extractTemplateVariables(subject);
      const bodyVars = extractTemplateVariables(bodyMarkdown);
      return [...new Set([...subjectVars, ...bodyVars])];
    } catch (err) {
      if (
        err instanceof UnknownTemplateVariableError ||
        err instanceof DisallowedTemplateSyntaxError
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  private validateRequiredSubsetOfReferenced(
    requiredVariables: string[],
    referenced: readonly string[],
  ): void {
    const referencedSet = new Set(referenced);
    const notReferenced = requiredVariables.filter(
      (v) => !referencedSet.has(v),
    );
    if (notReferenced.length > 0) {
      throw new BadRequestException(
        `requiredVariables lists ${notReferenced
          .map((v) => `"${v}"`)
          .join(", ")}, which subject/bodyMarkdown never reference. A ` +
          "required variable must actually appear in the template text.",
      );
    }
  }

  async create(dto: CreateTemplateDto): Promise<PublicMessageTemplate> {
    const referenced = this.extractAndValidateVariables(
      dto.subject,
      dto.bodyMarkdown,
    );
    const requiredVariables = dto.requiredVariables ?? [];
    this.validateRequiredSubsetOfReferenced(requiredVariables, referenced);

    const existing = await this.prisma.scoped.messageTemplate.findFirst({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(duplicateCodeMessage(dto.code));
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      let created: PublicMessageTemplate;
      try {
        created = await tx.messageTemplate.create({
          data: {
            code: dto.code,
            name: dto.name,
            category: dto.category,
            subject: dto.subject,
            bodyMarkdown: dto.bodyMarkdown,
            variables: referenced,
            requiredVariables,
            isSystem: false,
            version: 1,
            // organizationId deliberately omitted -- the tenant-scoping
            // extension supplies it at runtime (same convention as
            // EmployeesService.create / DataSourcesService.create /
            // RecipientsService.create).
          } as never,
          select: MESSAGE_TEMPLATE_PUBLIC_SELECT,
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          throw new ConflictException(duplicateCodeMessage(dto.code));
        }
        throw err;
      }

      // "TEMPLATE_CREATED" added to AUDIT_ACTIONS by the Wave 1
      // integrator (src/common/audit/audit-actions.ts) -- Task 3
      // originally reused "TEMPLATE_UPDATED" with metadata.op: "created"
      // because only that integrator-owned file may add a new action.
      await this.auditService.record(tx, {
        action: "TEMPLATE_CREATED",
        resourceType: "MessageTemplate",
        resourceId: created.id,
        metadata: {
          op: "created",
          code: created.code,
          category: created.category,
          variables: created.variables,
          requiredVariables: created.requiredVariables,
        },
      });

      return created;
    });
  }

  async update(
    id: string,
    dto: UpdateTemplateDto,
  ): Promise<PublicMessageTemplate> {
    const existing = await this.prisma.scoped.messageTemplate.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Message template "${id}" not found.`);
    }

    const nextSubject = dto.subject ?? existing.subject;
    const nextBody = dto.bodyMarkdown ?? existing.bodyMarkdown;
    const referenced = this.extractAndValidateVariables(nextSubject, nextBody);
    const nextRequired = dto.requiredVariables ?? existing.requiredVariables;
    this.validateRequiredSubsetOfReferenced(nextRequired, referenced);

    let removedBreachElements: string[] = [];
    if (existing.category === "BREACH_NOTICE") {
      const existingReferenced = new Set(existing.variables);
      const nextReferencedSet = new Set(referenced);
      removedBreachElements = BREACH_NOTIFICATION_REQUIRED_ELEMENTS.filter(
        (element) =>
          existingReferenced.has(element) && !nextReferencedSet.has(element),
      );
      if (
        removedBreachElements.length > 0 &&
        dto.acknowledgeBreachElementRemoval !== true
      ) {
        throw new ConflictException(
          "This edit removes mandatory breach-notice placeholder(s) " +
            `required by Rule 7(1): ${removedBreachElements
              .map((v) => `{{${v}}}`)
              .join(", ")}. Resubmit with ` +
            '"acknowledgeBreachElementRemoval": true to proceed -- the ' +
            "acknowledgement will be recorded on the audit log.",
        );
      }
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.messageTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          subject: dto.subject,
          bodyMarkdown: dto.bodyMarkdown,
          variables: referenced,
          requiredVariables: nextRequired,
          version: { increment: 1 },
        },
        select: MESSAGE_TEMPLATE_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "TEMPLATE_UPDATED",
        resourceType: "MessageTemplate",
        resourceId: id,
        metadata: {
          op: "updated",
          code: existing.code,
          version: updated.version,
          variables: updated.variables,
          requiredVariables: updated.requiredVariables,
          ...(removedBreachElements.length > 0
            ? {
                removedBreachElements,
                breachElementRemovalAcknowledged: true,
              }
            : {}),
        },
      });

      return updated;
    });
  }

  async preview(
    id: string,
    dto: PreviewTemplateDto,
  ): Promise<RenderedTemplate> {
    const template = await this.prisma.scoped.messageTemplate.findFirst({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException(`Message template "${id}" not found.`);
    }

    const rawVariables = dto.variables ?? {};
    const variables: Partial<Record<TemplateVariableName, string>> = {};
    for (const [key, value] of Object.entries(rawVariables)) {
      if (typeof value !== "string") {
        throw new BadRequestException(
          `variables.${key} must be a string.`,
        );
      }
      variables[key as TemplateVariableName] = value;
    }

    const organization = await this.prisma.scoped.organization.findFirstOrThrow();

    try {
      return renderOrganizationMessageTemplate({
        subjectSource: template.subject,
        bodySource: template.bodyMarkdown,
        requiredVariables: template.requiredVariables,
        variables,
        organization: {
          dpoName: organization.dpoName,
          dpoEmail: organization.dpoEmail,
          dpoPhone: organization.dpoPhone,
          responsiblePersonName: organization.responsiblePersonName,
          responsiblePersonEmail: organization.responsiblePersonEmail,
          grievanceContactEmail: organization.grievanceContactEmail,
        },
      });
    } catch (err) {
      if (
        err instanceof MissingRequiredVariableError ||
        err instanceof UnknownTemplateVariableError ||
        err instanceof DisallowedTemplateSyntaxError ||
        err instanceof MissingOrganizationContactError
      ) {
        toBadRequest(err);
      }
      throw err;
    }
  }
}
