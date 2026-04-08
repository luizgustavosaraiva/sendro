import { describe, expect, it } from "vitest";
import { renderDashboardPage } from "../src/app/(app)/dashboard/page";
import { renderBillingPage } from "../src/app/(app)/dashboard/billing/page";

const baseCompanyViewModel = {
  user: { name: "Company", email: "c@sendro.test", role: "company" as const },
  profile: { name: "Company", stripeCustomerId: null },
  diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
  bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
  bondsState: "empty" as const,
  invitations: { state: "empty" as const, invitations: [] },
  retailerDeliveries: { state: "not-retailer" as const, deliveries: [], error: "Somente lojistas podem criar entregas pelo dashboard." },
  companyDeliveries: { state: "empty" as const, deliveries: [], activeQueue: [], waitingQueue: [] },
  driverDeliveries: {
    state: "not-driver" as const,
    offerState: "not-driver" as const,
    strikeState: "not-driver" as const,
    deliveries: [],
    activeOffer: null,
    strikeSummary: { total: 0, lastStrike: null, activeConsequence: null, bondStatus: null },
    error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard."
  }
};

describe("billing SSR page", () => {
  it("shows billing nav entry from main dashboard", () => {
    const html = renderDashboardPage({
      user: { name: "Ops", email: "ops@sendro.test", role: "company" },
      profile: { name: "Ops", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      bondsState: "empty",
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", deliveries: [], error: "Somente lojistas podem criar entregas pelo dashboard." },
      companyDeliveries: { state: "empty", deliveries: [], activeQueue: [], waitingQueue: [] },
      driverDeliveries: {
        state: "not-driver",
        offerState: "not-driver",
        strikeState: "not-driver",
        deliveries: [],
        activeOffer: null,
        strikeSummary: { total: 0, lastStrike: null, activeConsequence: null, bondStatus: null },
        error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard."
      },
      billing: {
        state: "empty",
        rules: [],
        connect: {
          state: "loaded",
          status: {
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            stripeAccountId: null,
            status: "not_connected",
            chargesEnabled: false,
            payoutsEnabled: false,
            connectedAt: null
          }
        }
      }
    });

    expect(html).toContain('data-testid="nav-billing"');
    expect(html).toContain('/dashboard/billing');
  });

  it("renders explicit not-company state", () => {
    const html = renderBillingPage({
      user: { name: "Retailer", email: "r@sendro.test", role: "retailer" },
      profile: { name: "Retailer", stripeCustomerId: null },
      diagnostics: { role: "retailer", profileCreated: true, stripeStage: "created" },
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      bondsState: "not-company",
      invitations: { state: "not-company", invitations: [], error: "Somente contas empresa podem gerar e listar convites." },
      retailerDeliveries: { state: "empty", deliveries: [] },
      companyDeliveries: { state: "not-company", deliveries: [], activeQueue: [], waitingQueue: [], error: "Somente contas empresa visualizam a fila operacional de entregas." },
      driverDeliveries: { state: "not-driver", offerState: "not-driver", strikeState: "not-driver", deliveries: [], activeOffer: null, strikeSummary: { total: 0, lastStrike: null, activeConsequence: null, bondStatus: null }, error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard." },
      billing: {
        state: "not-company",
        rules: [],
        error: "Somente contas empresa podem gerenciar regras de cobrança.",
        connect: {
          state: "not-company",
          error: "Somente contas empresa podem conectar Stripe Connect."
        }
      }
    });

    expect(html).toContain('data-testid="billing-not-company"');
    expect(html).toContain('data-testid="billing-connect-not-company"');
    expect(html).toContain('data-testid="billing-state">not-company');
  });

  it("renders connect pending and connected branches with deterministic test ids", () => {
    const pendingHtml = renderBillingPage({
      ...baseCompanyViewModel,
      billing: {
        state: "empty",
        rules: [],
        connect: {
          state: "loaded",
          status: {
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            stripeAccountId: null,
            status: "pending_requirements",
            chargesEnabled: false,
            payoutsEnabled: false,
            connectedAt: null
          }
        }
      }
    });

    expect(pendingHtml).toContain('data-testid="billing-connect-panel"');
    expect(pendingHtml).toContain('data-testid="billing-connect-pending"');
    expect(pendingHtml).toContain('data-testid="billing-connect-form"');
    expect(pendingHtml).toContain('data-testid="billing-connect-submit"');
    expect(pendingHtml).toContain('data-testid="billing-connect-redirect-note"');

    const connectedHtml = renderBillingPage({
      ...baseCompanyViewModel,
      billing: {
        state: "loaded",
        rules: [],
        connect: {
          state: "loaded",
          status: {
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            stripeAccountId: "acct_123",
            status: "connected",
            chargesEnabled: true,
            payoutsEnabled: true,
            connectedAt: "2026-02-01T12:00:00.000Z"
          }
        }
      }
    });

    expect(connectedHtml).toContain('data-testid="billing-connect-connected"');
    expect(connectedHtml).toContain('data-testid="billing-connect-account-id"');
  });

  it("renders empty state and loaded table rows", () => {
    const emptyHtml = renderBillingPage({
      ...baseCompanyViewModel,
      billing: {
        state: "empty",
        rules: [],
        connect: {
          state: "loaded",
          status: {
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            stripeAccountId: null,
            status: "not_connected",
            chargesEnabled: false,
            payoutsEnabled: false,
            connectedAt: null
          }
        }
      }
    });
    expect(emptyHtml).toContain('data-testid="billing-empty"');

    const loadedHtml = renderBillingPage({
      ...baseCompanyViewModel,
      billing: {
        state: "loaded",
        createFeedback: { ruleId: "550e8400-e29b-41d4-a716-446655440010", message: "Regra criada" },
        connect: {
          state: "loaded",
          status: {
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            stripeAccountId: "acct_123",
            status: "connected",
            chargesEnabled: true,
            payoutsEnabled: true,
            connectedAt: "2026-01-01T00:00:00.000Z"
          }
        },
        rules: [
          {
            ruleId: "550e8400-e29b-41d4-a716-446655440010",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            region: "sudeste",
            deliveryType: "bike",
            weightMinGrams: 0,
            weightMaxGrams: 5000,
            amountCents: 1290,
            currency: "BRL",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      }
    });

    expect(loadedHtml).toContain('data-testid="billing-rules-table"');
    expect(loadedHtml).toContain('data-testid="billing-rule-row-550e8400-e29b-41d4-a716-446655440010"');
    expect(loadedHtml).toContain("BRL 12.90");
    expect(loadedHtml).toContain('data-testid="billing-feedback"');
  });

  it("renders connect error while preserving pricing form and pricing content", () => {
    const html = renderBillingPage({
      ...baseCompanyViewModel,
      companyDeliveries: { state: "loaded", deliveries: [], activeQueue: [], waitingQueue: [] },
      billing: {
        state: "loaded",
        rules: [
          {
            ruleId: "550e8400-e29b-41d4-a716-446655440011",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            region: "sul",
            deliveryType: "carro",
            weightMinGrams: 1,
            weightMaxGrams: 10000,
            amountCents: 2590,
            currency: "BRL",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        connect: { state: "error", error: "trpc_billing_connectStatus_failed:500:boom" }
      }
    });

    expect(html).toContain('data-testid="billing-connect-error"');
    expect(html).toContain("trpc_billing_connectStatus_failed");
    expect(html).toContain('data-testid="billing-form"');
    expect(html).toContain('data-testid="billing-rules-table"');
  });
});
