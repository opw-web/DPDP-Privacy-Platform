import { primaryKeyWhereFor } from "./tenant.extension";

/**
 * Fix round 3, item 1 (rated the highest-value follow-up in the file):
 * `primaryKeyWhereFor` used to have no guard against a primary-key field
 * resolving to `undefined`. Prisma drops an `undefined` field from a
 * `where` clause entirely rather than filtering on it, which is exactly
 * the shape of the round-2 mass-delete Critical (`{ id: undefined }`
 * collapsing a predicate to "no filter on `id`"). These tests cover both
 * branches the guard added: an undefined PK field value, and a model with
 * no known PK fields at all.
 */
describe("primaryKeyWhereFor", () => {
  it("builds a where clause from a single-field primary key", () => {
    expect(
      primaryKeyWhereFor("DataPrincipal", { id: "dp-1", displayName: "X" }),
    ).toEqual({ id: "dp-1" });
  });

  it("builds a where clause from a compound primary key", () => {
    expect(
      primaryKeyWhereFor("RolePermission", {
        roleId: "role-1",
        permissionCode: "perm.read",
      }),
    ).toEqual({ roleId: "role-1", permissionCode: "perm.read" });
  });

  it("throws if a primary-key field resolves to undefined", () => {
    expect(() =>
      primaryKeyWhereFor("DataPrincipal", { displayName: "X" }),
    ).toThrow(/undefined for primary-key field 'id'/);
  });

  it("throws if only SOME of a compound primary key's fields are present", () => {
    expect(() =>
      primaryKeyWhereFor("RolePermission", { roleId: "role-1" }),
    ).toThrow(/undefined for primary-key field 'permissionCode'/);
  });

  it("throws if the model has no known primary-key fields at all", () => {
    expect(() => primaryKeyWhereFor("NotARealModel", { id: "x" })).toThrow(
      /found no primary-key fields for model 'NotARealModel'/,
    );
  });
});
