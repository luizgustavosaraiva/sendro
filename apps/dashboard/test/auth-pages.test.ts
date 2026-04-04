import { describe, expect, it } from "vitest";
import LoginPage from "../src/app/(auth)/login/page";
import RegisterPage from "../src/app/(auth)/register/page";
import { renderDashboardPage } from "../src/app/(app)/dashboard/page";
import { isProtectedPath } from "../src/middleware";

describe("dashboard auth pages", () => {
  it("renders login with actionable fields", () => {
    const html = LoginPage();
    expect(html).toContain("Login Sendro");
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain("Criar conta");
  });

  it("renders register with role selector and driver conditional fields script", () => {
    const html = RegisterPage();
    expect(html).toContain("Cadastro Sendro");
    expect(html).toContain('id="role-select"');
    expect(html).toContain("Nome da empresa");
    expect(html).toContain("Nome do entregador");
    expect(html).toContain("Telefone");
  });

  it("renders authenticated dashboard proof with name and role", () => {
    const html = renderDashboardPage({
      user: {
        name: "ACME Company",
        email: "company@sendro.test",
        role: "company"
      },
      profile: {
        name: "ACME Company",
        stripeCustomerId: "cus_123"
      },
      diagnostics: {
        role: "company",
        profileCreated: true,
        stripeStage: "created"
      }
    });

    expect(html).toContain("Dashboard autenticado");
    expect(html).toContain("ACME Company");
    expect(html).toContain('data-testid="user-role">company');
    expect(html).toContain("cus_123");
  });

  it("marks dashboard as a protected path", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/login")).toBe(false);
  });
});
