import { Prisma } from "@prisma/client";
import {
  GLOBAL_MODELS,
  INDIRECT_TENANT_SCOPED_MODELS,
  SELF_SCOPED_MODELS,
  TENANT_SCOPED_MODELS,
} from "./tenant-scoped-models";

/**
 * The security boundary in this codebase is "every model with an
 * organizationId column is listed in TENANT_SCOPED_MODELS (or the indirect
 * map), and Organization -- which has no organizationId column because it
 * IS the tenant -- is listed in SELF_SCOPED_MODELS, never in
 * GLOBAL_MODELS". This test derives the real answer from the live Prisma
 * schema (via the DMMF) so a model added in a later task without updating
 * the list fails here loudly, instead of leaking data silently.
 *
 * Fix round 1 (task 3 review, Critical 1): the first pass put
 * `Organization` in `GLOBAL_MODELS` alongside `Permission`, which let this
 * very test lock in a real cross-tenant leak
 * (`prisma.scoped.organization.findMany({})` returned every org). These
 * assertions now pin `GLOBAL_MODELS` down to `["Permission"]` exactly.
 */
describe("tenant-scoped model registry is exhaustive", () => {
  const models = Prisma.dmmf.datamodel.models;

  it("covers every model in the schema exactly once (direct, indirect, self, or global)", () => {
    const accountedFor = new Set<string>([
      ...TENANT_SCOPED_MODELS,
      ...Object.keys(INDIRECT_TENANT_SCOPED_MODELS),
      ...SELF_SCOPED_MODELS,
      ...GLOBAL_MODELS,
    ]);

    const schemaModelNames = models.map((m) => m.name);

    expect(new Set(schemaModelNames)).toEqual(new Set(accountedFor));
    expect(accountedFor.size).toBe(schemaModelNames.length);
  });

  it("lists every model with an organizationId scalar field as direct or indirect (never self or global)", () => {
    for (const model of models) {
      const hasOrganizationId = model.fields.some(
        (f) => f.name === "organizationId" && f.kind === "scalar",
      );
      if (hasOrganizationId) {
        expect(TENANT_SCOPED_MODELS as readonly string[]).toContain(model.name);
        expect(GLOBAL_MODELS as readonly string[]).not.toContain(model.name);
        expect(SELF_SCOPED_MODELS as readonly string[]).not.toContain(
          model.name,
        );
      }
    }
  });

  it("does not list a model with no organizationId column as directly tenant-scoped", () => {
    for (const modelName of TENANT_SCOPED_MODELS) {
      const model = models.find((m) => m.name === modelName);
      expect(model).toBeDefined();
      expect(
        model?.fields.some(
          (f) => f.name === "organizationId" && f.kind === "scalar",
        ),
      ).toBe(true);
    }
  });

  it("keeps Permission as the only truly global (unscoped) model", () => {
    expect([...GLOBAL_MODELS]).toEqual(["Permission"]);
  });

  it("keeps Organization as the only self-scoped model", () => {
    expect([...SELF_SCOPED_MODELS]).toEqual(["Organization"]);
    // and confirms *why*: it really has no organizationId column of its own.
    const organization = models.find((m) => m.name === "Organization");
    expect(organization?.fields.some((f) => f.name === "organizationId")).toBe(
      false,
    );
  });
});
