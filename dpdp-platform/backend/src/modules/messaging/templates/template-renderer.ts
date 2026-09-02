import Handlebars from "handlebars";
import {
  BREACH_NOTIFICATION_REQUIRED_ELEMENTS,
  TemplateVariableName,
  isWhitelistedTemplateVariable,
} from "./whitelisted-variables";

/**
 * The whitelisted, escaping-safe Handlebars renderer for `MessageTemplate`
 * bodies/subjects (spec §4.9, line 72 and line 1054). Campaigns (task 11)
 * and breach notices (task 14) render exclusively through
 * `renderOrganizationMessageTemplate` below -- neither should call
 * Handlebars directly.
 *
 * Threat model this file exists for: a template is markdown authored by
 * an employee with `CAN_SEND_MESSAGES`, then sent, unreviewed by anyone
 * else, to a whole audience of data principals. Without a closed
 * whitelist and syntax restriction, that employee (or anyone who
 * compromises their account) could:
 *   - reference an unintended field that happens to be readable from
 *     whatever context object a caller builds (data exfiltration into a
 *     mass-sent notice);
 *   - use `{{{tripleStash}}}` to defeat Handlebars' default HTML escaping
 *     and inject markup/script that a downstream markdown-to-HTML step
 *     renders as live, executable content (stored XSS in the portal
 *     inbox -- spec line 1054's explicit "stop and fix it before
 *     anything else").
 *
 * Both are closed off structurally, not just by convention: every
 * template is parsed to its Handlebars AST and walked BEFORE any
 * substitution happens. Only plain, escaped `{{whitelisted_name}}`
 * mustache references and literal text are permitted -- no blocks, no
 * partials, no helpers/hash arguments, no triple-stash, no dotted/
 * indexed paths. Anything else throws `DisallowedTemplateSyntaxError`.
 *
 * AST TYPING NOTE: `handlebars`'s shipped `types/index.d.ts` declares the
 * AST node interfaces (`Program`, `Statement`, `MustacheStatement`,
 * `PathExpression`, ...) on a GLOBAL AMBIENT namespace named `hbs`
 * (`declare namespace hbs { namespace AST { ... } }`, unexported, in the
 * same file). The *module* `"handlebars"` itself exports the separate
 * `Handlebars` namespace/value (`declare module "handlebars" { export =
 * Handlebars; }`), whose own nested `Handlebars.AST` carries only the
 * runtime `helpers` const -- none of the node type members. So
 * `import type * as hbs from "handlebars"` binds the *wrong* thing to
 * the name `hbs` (the `Handlebars` export, aliased), which shadows the
 * real ambient `hbs` global and makes `hbs.AST.MustacheStatement` etc.
 * fail to resolve (`Namespace 'Handlebars.AST' has no exported member
 * 'MustacheStatement'`). The fix is simply to NOT import anything named
 * `hbs` -- the ambient global namespace is already in scope everywhere
 * in this program once `handlebars`'s .d.ts has been loaded (which
 * happens via the `import Handlebars from "handlebars"` below), so the
 * bare `hbs.AST.*` references below resolve correctly without any
 * import statement. This is a real, exhaustive walk of the actual
 * parsed AST -- not a regex over source text.
 */

// A private, unpolluted Handlebars environment -- no helper an operator
// registers globally on the shared `Handlebars` module (there is none in
// this codebase today, but nothing stops a future one) can leak into
// message-template rendering.
const engine = Handlebars.create();

export class TemplateRenderError extends Error {
  constructor(
    message: string,
    public readonly variableName?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A `{{...}}` in the template references a name outside the closed whitelist. */
export class UnknownTemplateVariableError extends TemplateRenderError {
  constructor(variableName: string) {
    super(
      `Template references "{{${variableName}}}", which is not one of the ` +
        "whitelisted template variables. Rendering is refused rather than " +
        "dropping it or printing it blank.",
      variableName,
    );
  }
}

/** A variable listed in `requiredVariables` has no non-empty value to render. */
export class MissingRequiredVariableError extends TemplateRenderError {
  constructor(variableName: string) {
    super(
      `Required variable "{{${variableName}}}" has no value. Rendering is ` +
        "refused rather than printing an empty string in its place.",
      variableName,
    );
  }
}

/**
 * The template body/subject uses Handlebars syntax other than a plain,
 * escaped `{{variable_name}}` reference -- a block, a partial, a helper
 * call, hash arguments, a dotted/indexed path, or unescaped `{{{...}}}`
 * output. Templates are markdown text with simple placeholders, never a
 * programmable view -- there is no legitimate use of any of these inside
 * a `MessageTemplate`.
 */
export class DisallowedTemplateSyntaxError extends TemplateRenderError {}

/** Neither a DPO nor a responsible person's business contact is on file
 * for this organization -- there is nothing truthful to inject into
 * `{{dpo_name}}`/`{{dpo_contact}}`, and Rule 9 requires that contact on
 * every rights response. Sending is refused rather than sending with a
 * blank. */
export class MissingOrganizationContactError extends TemplateRenderError {}

function assertSimpleWhitelistedMustache(
  mustache: hbs.AST.MustacheStatement,
): TemplateVariableName {
  if (!mustache.escaped) {
    throw new DisallowedTemplateSyntaxError(
      "Raw/unescaped output (\"{{{...}}}\") is not permitted in message " +
        "templates -- it would defeat HTML escaping.",
    );
  }
  if (mustache.params.length > 0 || mustache.hash) {
    throw new DisallowedTemplateSyntaxError(
      "Helper calls and hash arguments are not permitted in message " +
        "templates -- only plain \"{{variable_name}}\" references are.",
    );
  }
  const path = mustache.path;
  if (
    path.type !== "PathExpression" ||
    (path as hbs.AST.PathExpression).data ||
    (path as hbs.AST.PathExpression).parts.length !== 1 ||
    (path as hbs.AST.PathExpression).depth !== 0
  ) {
    throw new DisallowedTemplateSyntaxError(
      "Only simple, top-level \"{{variable_name}}\" references are " +
        "permitted -- no dotted paths, indices, \"../\" segments, or " +
        "\"@data\" references.",
    );
  }
  const name = (path as hbs.AST.PathExpression).parts[0] as string;
  if (!isWhitelistedTemplateVariable(name)) {
    throw new UnknownTemplateVariableError(name);
  }
  return name;
}

function walkStatement(
  statement: hbs.AST.Statement,
  found: Set<TemplateVariableName>,
): void {
  switch (statement.type) {
    case "ContentStatement":
    case "CommentStatement":
      return;
    case "MustacheStatement":
      found.add(
        assertSimpleWhitelistedMustache(statement as hbs.AST.MustacheStatement),
      );
      return;
    default:
      throw new DisallowedTemplateSyntaxError(
        `Disallowed template syntax node "${statement.type}" -- message ` +
          "templates may contain only literal text and plain " +
          "\"{{variable_name}}\" references.",
      );
  }
}

/**
 * Parses `source` to its Handlebars AST and returns the set of
 * whitelisted variable names it references, in first-appearance order.
 * Throws `DisallowedTemplateSyntaxError` for anything other than literal
 * text and plain escaped mustache references, and
 * `UnknownTemplateVariableError` for any mustache reference outside the
 * closed whitelist. Never returns partial results -- the first violation
 * throws.
 *
 * Called both when a template is saved (fail fast, before it can ever be
 * sent) and again at render time (defense in depth against a template
 * that reached storage some other way, e.g. a seed script bug).
 */
export function extractTemplateVariables(
  source: string,
): TemplateVariableName[] {
  let ast: hbs.AST.Program;
  try {
    ast = engine.parse(source);
  } catch (err) {
    throw new DisallowedTemplateSyntaxError(
      `Template is not valid Handlebars syntax: ${(err as Error).message}`,
    );
  }
  const found = new Set<TemplateVariableName>();
  for (const statement of ast.body) {
    walkStatement(statement, found);
  }
  return [...found];
}

export interface RenderTemplateInput {
  /** The template's `subject` field (source, not yet rendered). */
  subjectSource: string;
  /** The template's `bodyMarkdown` field (source, not yet rendered). */
  bodySource: string;
  /** Values for whitelisted variables this render call can supply. */
  variables: Partial<Record<TemplateVariableName, string>>;
  /** `MessageTemplate.requiredVariables` for the template being rendered. */
  requiredVariables: readonly string[];
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}

function renderSource(
  source: string,
  variables: Partial<Record<TemplateVariableName, string>>,
): { rendered: string; referenced: TemplateVariableName[] } {
  const referenced = extractTemplateVariables(source);
  const compiled = engine.compile(source, {
    noEscape: false,
    strict: false,
    knownHelpers: {},
    knownHelpersOnly: true,
  });
  const context: Record<string, string> = {};
  for (const name of referenced) {
    context[name] = variables[name] ?? "";
  }
  return { rendered: compiled(context), referenced };
}

/**
 * THE render function. Whitelisted-variable substitution with Handlebars'
 * default HTML escaping (spec requirement: `<script>alert(1)</script>` in
 * a value must arrive as visible text, never executable markup).
 *
 * Throws (never returns a partial or empty-substituted result on error):
 *   - `DisallowedTemplateSyntaxError` -- subject or body uses Handlebars
 *     syntax other than plain escaped `{{variable_name}}` references.
 *   - `UnknownTemplateVariableError` -- subject or body references a
 *     `{{name}}` outside `TEMPLATE_VARIABLE_WHITELIST`.
 *   - `MissingRequiredVariableError` -- a name in the EFFECTIVE required
 *     set (see below) has no non-empty-string value in `variables`
 *     (`undefined`, `null`, or an empty/whitespace-only string all count
 *     as missing).
 *
 * The effective required set is `requiredVariables` UNION whichever of
 * `BREACH_NOTIFICATION_REQUIRED_ELEMENTS` (the six Rule 7(1)/breach-
 * reference placeholders -- `whitelisted-variables.ts`) the subject or
 * body actually reference. This is deliberately NOT "every referenced
 * variable is required": a referenced variable outside that six-name set
 * that is whitelisted but not listed in `requiredVariables` still renders
 * as an empty string, exactly as before -- e.g. `{{portal_link}}` or
 * `{{withdrawal_url}}` are legitimately optional on templates that
 * reference them defensively. The six breach elements are different:
 * they are named explicitly and unconditionally by spec §4.9, so a
 * template that declares one is never allowed to render it blank, no
 * matter what its own `requiredVariables` array says. This closes a real
 * incident: a BREACH_NOTICE campaign created with ad-hoc subject/body
 * text (no `templateId`) got `requiredVariables: []` -- nothing wired
 * `dto.requiredVariables` from the campaign-builder UI -- so this
 * function's required-check never ran at all, and a breach record with
 * NULL narrative fields rendered and sent 114 legally defective notices
 * with no error anywhere. Enforcing "declared implies required" for
 * these six names here, in the renderer itself, closes the gap for every
 * current and future caller (ad-hoc campaign text, an edited template, a
 * template a future task adds) rather than relying on every call site to
 * separately remember to populate `requiredVariables` correctly.
 */
export function renderMessageTemplate(
  input: RenderTemplateInput,
): RenderedTemplate {
  // Parsing (and therefore whitelist/syntax validation) happens for both
  // subject and body before any required-variable check, so an unknown
  // variable or disallowed syntax is reported before a missing-required
  // error would otherwise mask it. The returned `referenced` sets also
  // drive the breach-element enforcement below.
  const subjectCheck = renderSource(input.subjectSource, {});
  const bodyCheck = renderSource(input.bodySource, {});
  const referenced = new Set<TemplateVariableName>([
    ...subjectCheck.referenced,
    ...bodyCheck.referenced,
  ]);

  const effectiveRequired = new Set<string>(input.requiredVariables);
  for (const element of BREACH_NOTIFICATION_REQUIRED_ELEMENTS) {
    if (referenced.has(element)) effectiveRequired.add(element);
  }

  for (const required of effectiveRequired) {
    const value = input.variables[required as TemplateVariableName];
    if (value === undefined || value === null || value.trim().length === 0) {
      throw new MissingRequiredVariableError(required);
    }
  }

  const subject = renderSource(input.subjectSource, input.variables).rendered;
  const body = renderSource(input.bodySource, input.variables).rendered;
  return { subject, body };
}

/**
 * The organization fields `{{dpo_name}}`/`{{dpo_contact}}` are sourced
 * from -- Rule 9 / RT-16: every response to a rights communication must
 * carry the DPO or responsible person's business contact information,
 * injected by the template layer itself so an employee cannot omit or
 * falsify it by typing something else into a `variables` payload.
 */
export interface OrganizationContactFields {
  dpoName: string | null;
  dpoEmail: string | null;
  dpoPhone: string | null;
  responsiblePersonName: string | null;
  responsiblePersonEmail: string | null;
  grievanceContactEmail: string | null;
}

/**
 * Derives the `dpo_name`/`dpo_contact` values from the organization
 * record. Prefers the appointed DPO; falls back to the responsible
 * person under s.8(9) when no DPO is appointed. Throws
 * `MissingOrganizationContactError` when neither is configured -- there
 * is nothing truthful to send.
 */
export function resolveOrganizationContactVariables(
  org: OrganizationContactFields,
): Pick<Record<TemplateVariableName, string>, "dpo_name" | "dpo_contact"> {
  const name = org.dpoName?.trim() || org.responsiblePersonName?.trim();
  if (!name) {
    throw new MissingOrganizationContactError(
      "Organization has neither a DPO name nor a responsible person name " +
        "on file. Every rights-related communication must carry a " +
        "responsible business contact (Rule 9) -- configure one before " +
        "sending.",
    );
  }
  const contactCandidates = [
    org.dpoEmail?.trim(),
    org.dpoPhone?.trim(),
    org.responsiblePersonEmail?.trim(),
    org.grievanceContactEmail?.trim(),
  ].filter((v): v is string => !!v);
  // Prefer whichever of (dpoEmail, dpoPhone) exist together; otherwise
  // fall back to whatever single contact channel is on file.
  const contactParts = [org.dpoEmail?.trim(), org.dpoPhone?.trim()].filter(
    (v): v is string => !!v,
  );
  const contact =
    contactParts.length > 0 ? contactParts.join(" / ") : contactCandidates[0];
  if (!contact) {
    throw new MissingOrganizationContactError(
      "Organization has no DPO email/phone, responsible person email, or " +
        "grievance contact email on file. Every rights-related " +
        "communication must carry a responsible business contact " +
        "(Rule 9) -- configure one before sending.",
    );
  }
  return { dpo_name: name, dpo_contact: contact };
}

export interface RenderOrganizationTemplateInput {
  subjectSource: string;
  bodySource: string;
  requiredVariables: readonly string[];
  /** Caller-supplied values. Any `dpo_name`/`dpo_contact` entries here
   * are IGNORED -- those two are always overridden from `organization`. */
  variables: Partial<Record<TemplateVariableName, string>>;
  organization: OrganizationContactFields;
}

/**
 * The entry point campaigns (task 11) and breach notices (task 14) are
 * expected to render through. Identical to `renderMessageTemplate`
 * except `dpo_name`/`dpo_contact` are always taken from `organization`,
 * never from `variables` -- so a caller cannot override, omit, or
 * falsify the DPO contact by what it puts in its own variables map
 * (RT-16). Throws everything `renderMessageTemplate` throws, plus
 * `MissingOrganizationContactError`.
 */
export function renderOrganizationMessageTemplate(
  input: RenderOrganizationTemplateInput,
): RenderedTemplate {
  const orgContact = resolveOrganizationContactVariables(input.organization);
  const variables: Partial<Record<TemplateVariableName, string>> = {
    ...input.variables,
    ...orgContact,
  };
  return renderMessageTemplate({
    subjectSource: input.subjectSource,
    bodySource: input.bodySource,
    variables,
    requiredVariables: input.requiredVariables,
  });
}
