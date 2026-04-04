import { describe, expect, it } from "vitest";
import {
  entityRoles,
  loginSchema,
  registerSchema,
  registerSchemaByRole,
  type EntityRole
} from "../../packages/shared/src/index";

describe("workspace scaffold", () => {
  it("exports the three independent auth entity roles", () => {
    const roles: EntityRole[] = ["company", "retailer", "driver"];
    expect(entityRoles).toEqual(roles);
  });

  it("validates a company register payload through the shared discriminated contract", () => {
    const payload = {
      role: "company",
      name: "ACME Courier",
      email: "ops@acme.test",
      password: "secret123",
      companyName: "ACME Courier"
    };

    expect(registerSchema.parse(payload)).toMatchObject(payload);
    expect(registerSchemaByRole.company.parse(payload)).toMatchObject(payload);
  });

  it("validates login payloads used by api and dashboard", () => {
    const payload = {
      email: "user@sendro.test",
      password: "secret123"
    };

    expect(loginSchema.parse(payload)).toMatchObject(payload);
  });
});
