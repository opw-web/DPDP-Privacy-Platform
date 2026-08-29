import { Prisma } from "@prisma/client";
import {
  GLOBAL_MODELS,
  INDIRECT_TENANT_SCOPED_MODELS,
  TENANT_SCOPED_MODELS,
} from "./tenant-scoped-models";

/**
 * The security boundary in this codebase is "every model with an
 * organizationId column is listed in TENANT_SCOPED_MODELS (or the indirect
 * map)". This test derives the real answer from the live Prisma schema
 * (via the DMMF) so a model added in a later task without updating the
 * list fails here loudly, instead of leaking data silently.
 */
describe("tenant-scoped model registry is exhaustive", () => {
  const models = Prisma.dmmf.datamodel.models;

  it("covers every model in the schema exactly once (direct, indirect, or exempt)", () => {
    const accountedFor = new Set<string>([
      ...TENANT_SCOPED_MODELS,
      ...Object.keys(INDIRECT_TENANT_SCOPED_MODELS),
      ...GLOBAL_MODELS,
    ]);

    const schemaModelNames = models.map((m) => m.name);

    expect(new Set(schemaModelNames)).toEqual(new Set(accountedFor));
    expect(accountedFor.size).toBe(schemaModelNames.length);
  });

  it("lists every model with an organizationId scalar field as direct or indirect (never exempt)", () => {
    for (const model of models) {
      const hasOrganizationId = model.fields.some(
        (f) => f.name === "organizationId" && f.kind === "scalar",
      );
      if (hasOrganizationId) {
        expect(TENANT_SCOPED_MODELS as readonly string[]).toContain(model.name);
        expect(GLOBAL_MODELS as readonly string[]).not.toContain(model.name);
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

  it("keeps Organization and Permission as the only global (unscoped) models", () => {
    expect([...GLOBAL_MODELS].sort()).toEqual(["Organization", "Permission"]);
  });
});
