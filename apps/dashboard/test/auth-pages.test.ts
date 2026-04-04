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

  it("renders invite-aware register state with hidden token and driver lock", () => {
    const html = RegisterPage({
      inviteToken: "invitetoken1234567890",
      inviteStatus: "pending",
      inviteCompanyName: "ACME Company",
      inviteCompanySlug: "acme-company"
    });

    expect(html).toContain('data-testid="invite-card"');
    expect(html).toContain('data-testid="invite-token">invitetoken1234567890');
    expect(html).toContain('data-testid="invite-status">pending');
    expect(html).toContain('input type="hidden" name="inviteToken" value="invitetoken1234567890"');
    expect(html).toContain('input type="hidden" name="role" value="driver"');
    expect(html).toContain('select name="role" id="role-select" disabled');
    expect(html).toContain("ACME Company");
  });

  it("renders wrong-role invite diagnostic copy", () => {
    const html = RegisterPage({
      inviteToken: "invitetoken1234567890",
      inviteStatus: "invalid-role",
      inviteError: "Este convite exige uma conta de entregador."
    });

    expect(html).toContain('data-testid="invite-invalid-role"');
    expect(html).toContain("Este convite é destinado a entregadores.");
  });

  it("renders authenticated company dashboard with separated bond sections and invitations", () => {
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
      },
      invitations: {
        state: "loaded",
        generatedInvitation: {
          invitationId: "550e8400-e29b-41d4-a716-446655440010",
          token: "generatedtoken123456",
          inviteUrl: "http://localhost:3000/invite/generatedtoken123456"
        },
        invitations: [
          {
            invitationId: "550e8400-e29b-41d4-a716-446655440010",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            token: "generatedtoken123456",
            channel: "link",
            status: "pending",
            invitedContact: "driver@sendro.test",
            expiresAt: "2026-01-04T00:00:00.000Z",
            acceptedAt: null,
            createdByUserId: "550e8400-e29b-41d4-a716-446655440011",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      }
    });

    expect(html).toContain("Dashboard autenticado");
    expect(html).toContain('data-testid="user-role">company');
    expect(html).toContain("Lojistas vinculados");
    expect(html).toContain("Solicitações pendentes");
    expect(html).toContain("Entregadores vinculados");
    expect(html).toContain("Convites de entregador");
    expect(html).toContain("Loja Centro");
    expect(html).toContain("Loja Norte");
    expect(html).toContain("Motorista Sul");
    expect(html).toContain('data-testid="bonds-state">loaded');
    expect(html).toContain('data-testid="invitations-state">loaded');
    expect(html).toContain('data-testid="generate-invitation-button"');
    expect(html).toContain('data-testid="generated-invitation"');
    expect(html).toContain('data-testid="generated-invite-url">http://localhost:3000/invite/generatedtoken123456');
    expect(html).toContain("driver@sendro.test");
    expect(html).toContain("cus_123");
  });

  it("renders stable empty states for company bonds and invitations", () => {
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
      },
      invitations: {
        state: "empty",
        invitations: []
      }
    });

    expect(html).toContain('data-testid="bonds-empty"');
    expect(html).toContain("Nenhum vínculo ativo ou pendente foi encontrado para esta empresa.");
    expect(html).toContain("Nenhum lojista vinculado no momento.");
    expect(html).toContain("Nenhuma solicitação pendente no momento.");
    expect(html).toContain("Nenhum entregador vinculado no momento.");
    expect(html).toContain('data-testid="invitation-list-empty"');
    expect(html).toContain("Nenhum convite gerado no momento.");
  });

  it("renders stable upstream failure copy for bonds and invitations", () => {
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
      },
      invitations: {
        state: "error",
        error: "A sessão foi resolvida, mas os convites não puderam ser carregados. Diagnóstico: trpc_invitations_listCompanyInvitations_failed:500:boom",
        invitations: []
      }
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="bonds-error"');
    expect(html).toContain('data-testid="invitation-error"');
    expect(html).toContain("A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados.");
    expect(html).toContain("trpc_bonds_listCompanyBonds_failed:500:boom");
    expect(html).toContain("trpc_invitations_listCompanyInvitations_failed:500:boom");
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
      },
      invitations: {
        state: "not-company",
        error: "Somente contas empresa podem gerar e listar convites.",
        invitations: []
      }
    });

    expect(html).toContain('data-testid="bonds-not-company"');
    expect(html).toContain('data-testid="invitation-not-company"');
    expect(html).toContain("Somente contas empresa visualizam vínculos da empresa no dashboard.");
    expect(html).toContain("Somente contas empresa podem gerar e listar convites.");
  });

  it("marks dashboard as a protected path", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/login")).toBe(false);
  });
});
