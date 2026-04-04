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

  it("renders authenticated company dashboard with separated bond sections", () => {
    const html = renderDashboardPage({
      user: {
        name: "ACME Company",
        email: "company@sendro.test",
        role: "company"
      },
      profile: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "ACME Company",
        stripeCustomerId: "cus_123"
      },
      diagnostics: {
        role: "company",
        profileCreated: true,
        stripeStage: "created"
      },
      bondsState: "loaded",
      bonds: {
        activeRetailers: [
          {
            bondId: "550e8400-e29b-41d4-a716-446655440001",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            entityId: "550e8400-e29b-41d4-a716-446655440002",
            entityType: "retailer",
            status: "active",
            requestedByUserId: "550e8400-e29b-41d4-a716-446655440003",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            entityName: "Loja Centro",
            entitySlug: "loja-centro",
            entityLifecycle: "active"
          }
        ],
        pendingRetailers: [
          {
            bondId: "550e8400-e29b-41d4-a716-446655440004",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            entityId: "550e8400-e29b-41d4-a716-446655440005",
            entityType: "retailer",
            status: "pending",
            requestedByUserId: "550e8400-e29b-41d4-a716-446655440006",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            entityName: "Loja Norte",
            entitySlug: "loja-norte",
            entityLifecycle: "pending"
          }
        ],
        activeDrivers: [
          {
            bondId: "550e8400-e29b-41d4-a716-446655440007",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            entityId: "550e8400-e29b-41d4-a716-446655440008",
            entityType: "driver",
            status: "active",
            requestedByUserId: "550e8400-e29b-41d4-a716-446655440009",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            entityName: "Motorista Sul",
            entityLifecycle: "active"
          }
        ]
      }
    });

    expect(html).toContain("Dashboard autenticado");
    expect(html).toContain('data-testid="user-role">company');
    expect(html).toContain("Lojistas vinculados");
    expect(html).toContain("Solicitações pendentes");
    expect(html).toContain("Entregadores vinculados");
    expect(html).toContain("Loja Centro");
    expect(html).toContain("Loja Norte");
    expect(html).toContain("Motorista Sul");
    expect(html).toContain('data-testid="bonds-state">loaded');
    expect(html).toContain("cus_123");
  });

  it("renders stable empty states for company bonds", () => {
    const html = renderDashboardPage({
      user: {
        name: "Empty Company",
        email: "empty@sendro.test",
        role: "company"
      },
      profile: {
        name: "Empty Company",
        stripeCustomerId: null
      },
      diagnostics: {
        role: "company",
        profileCreated: true,
        stripeStage: "skipped"
      },
      bondsState: "empty",
      bonds: {
        activeRetailers: [],
        pendingRetailers: [],
        activeDrivers: []
      }
    });

    expect(html).toContain('data-testid="bonds-empty"');
    expect(html).toContain("Nenhum vínculo ativo ou pendente foi encontrado para esta empresa.");
    expect(html).toContain("Nenhum lojista vinculado no momento.");
    expect(html).toContain("Nenhuma solicitação pendente no momento.");
    expect(html).toContain("Nenhum entregador vinculado no momento.");
  });

  it("renders stable upstream failure copy for bonds", () => {
    const html = renderDashboardPage({
      user: {
        name: "Error Company",
        email: "error@sendro.test",
        role: "company"
      },
      profile: {
        name: "Error Company",
        stripeCustomerId: null
      },
      diagnostics: {
        role: "company",
        profileCreated: false,
        stripeStage: "unknown"
      },
      bondsState: "error",
      bondsError: "A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados. Diagnóstico: trpc_bonds_listCompanyBonds_failed:500:boom",
      bonds: {
        activeRetailers: [],
        pendingRetailers: [],
        activeDrivers: []
      }
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="bonds-error"');
    expect(html).toContain("A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados.");
    expect(html).toContain("trpc_bonds_listCompanyBonds_failed:500:boom");
  });

  it("renders stable non-company diagnostic copy", () => {
    const html = renderDashboardPage({
      user: {
        name: "Retailer User",
        email: "retailer@sendro.test",
        role: "retailer"
      },
      profile: {
        name: "Retailer User",
        stripeCustomerId: null
      },
      diagnostics: {
        role: "retailer",
        profileCreated: true,
        stripeStage: "created"
      },
      bondsState: "not-company",
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
      bonds: {
        activeRetailers: [],
        pendingRetailers: [],
        activeDrivers: []
      }
    });

    expect(html).toContain('data-testid="bonds-not-company"');
    expect(html).toContain("Somente contas empresa visualizam vínculos da empresa no dashboard.");
  });

  it("marks dashboard as a protected path", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/login")).toBe(false);
  });
});
