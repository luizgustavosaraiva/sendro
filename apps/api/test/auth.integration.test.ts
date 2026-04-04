import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/index";

const roles: Array<{
  role: "company" | "retailer" | "driver";
  field: "companyName" | "retailerName" | "driverName";
  expectedStripe: boolean;
  phone?: string;
}> = [
  {
    role: "company",
    field: "companyName",
    expectedStripe: true
  },
  {
    role: "retailer",
    field: "retailerName",
    expectedStripe: true
  },
  {
    role: "driver",
    field: "driverName",
    expectedStripe: false,
    phone: "+5511999999999"
  }
];

describe("auth integration", () => {
  const appPromise = buildApp();

  beforeAll(async () => {
    await appPromise;
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  for (const scenario of roles) {
    it(`registers ${scenario.role}, returns session cookie, and resolves user.me`, async () => {
      const app = await appPromise;
      const agent = request.agent(app.server);
      const suffix = `${scenario.role}-${Date.now()}`;
      const registerPayload = {
        name: `${scenario.role} user`,
        email: `${scenario.role}.${suffix}@sendro.test`,
        password: "secret123",
        role: scenario.role,
        [scenario.field]: `${scenario.role} profile`,
        ...(scenario.phone ? { phone: scenario.phone } : {})
      };

      const registerResponse = await agent.post("/api/auth/sign-up/email").send(registerPayload);
      expect(registerResponse.status, registerResponse.text).toBeLessThan(400);
      const setCookieHeader = registerResponse.headers["set-cookie"];
      const setCookieValue = Array.isArray(setCookieHeader) ? setCookieHeader.join(";") : String(setCookieHeader ?? "");
      expect(setCookieValue).toContain("better-auth");

      const sessionResponse = await agent.get("/api/auth/get-session");
      expect(sessionResponse.status, sessionResponse.text).toBe(200);
      expect(sessionResponse.body.user.email).toBe(registerPayload.email);
      expect(sessionResponse.body.user.role).toBe(scenario.role);

      const trpcResponse = await agent.get("/trpc/user.me").set("origin", "http://localhost:3000");
      expect(trpcResponse.status, trpcResponse.text).toBe(200);
      const body = JSON.parse(trpcResponse.text);
      const data = body.result?.data?.json ?? body.result?.data ?? body;

      expect(data.user.email).toBe(registerPayload.email);
      expect(data.user.role).toBe(scenario.role);
      expect(data.profile.name).toBe(registerPayload.name);
      expect(Boolean(data.profile.stripeCustomerId)).toBe(scenario.expectedStripe);
      expect(data.diagnostics.role).toBe(scenario.role);
    });
  }
});
rio.role);
    });
  }
});
