import { describe, expect, it } from "vitest";
import { renderDashboardPage } from "../src/app/(app)/dashboard/page";
import { renderBillingPage } from "../src/app/(app)/dashboard/billing/page";

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
      billing: { state: "empty", rules: [] }
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
      billing: { state: "not-company", rules: [], error: "Somente contas empresa podem gerenciar regras de cobrança." }
    });

    expect(html).toContain('data-testid="billing-not-company"');
    expect(html).toContain('data-testid="billing-state">not-company');
  });

  it("renders empty state and loaded table rows", () => {
    const emptyHtml = renderBillingPage({
      user: { name: "Company", email: "c@sendro.test", role: "company" },
      profile: { name: "Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      bondsState: "empty",
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", deliveries: [], error: "Somente lojistas podem criar entregas pelo dashboard." },
      companyDeliveries: { state: "empty", deliveries: [], activeQueue: [], waitingQueue: [] },
      driverDeliveries: { state: "not-driver", offerState: "not-driver", strikeState: "not-driver", deliveries: [], activeOffer: null, strikeSummary: { total: 0, lastStrike: null, activeConsequence: null, bondStatus: null }, error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard." },
      billing: { state: "empty", rules: [] }
    });
    expect(emptyHtml).toContain('data-testid="billing-empty"');

    const loadedHtml = renderBillingPage({
      user: { name: "Company", email: "c@sendro.test", role: "company" },
      profile: { name: "Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      bondsState: "empty",
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", deliveries: [], error: "Somente lojistas podem criar entregas pelo dashboard." },
      companyDeliveries: { state: "empty", deliveries: [], activeQueue: [], waitingQueue: [] },
      driverDeliveries: { state: "not-driver", offerState: "not-driver", strikeState: "not-driver", deliveries: [], activeOffer: null, strikeSummary: { total: 0, lastStrike: null, activeConsequence: null, bondStatus: null }, error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard." },
      billing: {
        state: "loaded",
        createFeedback: { ruleId: "550e8400-e29b-41d4-a716-446655440010", message: "Regra criada" },
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

  it("renders billing error while preserving billing form", () => {
    const html = renderBillingPage({
      user: { name: "Company", email: "c@sendro.test", role: "company" },
      profile: { name: "Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      bondsState: "empty",
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", deliveries: [], error: "Somente lojistas podem criar entregas pelo dashboard." },
      companyDeliveries: { state: "loaded", deliveries: [], activeQueue: [], waitingQueue: [] },
      driverDeliveries: { state: "not-driver", offerState: "not-driver", strikeState: "not-driver", deliveries: [], activeOffer: null, strikeSummary: { total: 0, lastStrike: null, activeConsequence: null, bondStatus: null }, error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard." },
      billing: { state: "error", rules: [], error: "trpc_pricingRules_list_failed:500:boom" }
    });

    expect(html).toContain('data-testid="billing-error"');
    expect(html).toContain("trpc_pricingRules_list_failed");
    expect(html).toContain('data-testid="billing-form"');
  });
});
