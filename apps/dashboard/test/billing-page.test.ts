import { describe, expect, it } from "vitest";
import { renderDashboardPage } from "../src/app/(app)/dashboard/page";
import { renderBillingPage } from "../src/app/(app)/dashboard/billing/page";

const baseCompanyViewModel = {
  user: { name: "Company", email: "c@sendro.test", role: "company" as const },
  profile: { name: "Company", stripeCustomerId: null },
  diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
  bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
  bondsState: "empty" as const,
  summary: null,
  summaryState: "empty" as const,
  driversOperational: [],
  driversState: "empty" as const,
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
      ...baseCompanyViewModel,
      billing: {
        state: "empty",
        rules: [],
        financialKpis: { state: "empty", grossRevenueCents: 0, netRevenueCents: 0 },
        report: {
          state: "empty",
          filters: { periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-31T23:59:59.999Z", page: 1, limit: 50 }
        },
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
      ...baseCompanyViewModel,
      user: { name: "Retailer", email: "r@sendro.test", role: "retailer" },
      diagnostics: { role: "retailer", profileCreated: true, stripeStage: "created" },
      bondsState: "not-company",
      summaryState: "not-company",
      driversState: "not-company",
      invitations: { state: "not-company", invitations: [], error: "Somente contas empresa podem gerar e listar convites." },
      retailerDeliveries: { state: "empty", deliveries: [] },
      companyDeliveries: { state: "not-company", deliveries: [], activeQueue: [], waitingQueue: [], error: "Somente contas empresa visualizam a fila operacional de entregas." },
      billing: {
        state: "not-company",
        rules: [],
        error: "Somente contas empresa podem gerenciar regras de cobrança.",
        financialKpis: { state: "not-company", error: "Somente contas empresa visualizam KPIs financeiros." },
        report: {
          state: "not-company",
          filters: { periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-31T23:59:59.999Z", page: 1, limit: 50 },
          error: "Somente contas empresa visualizam relatórios financeiros."
        },
        connect: {
          state: "not-company",
          error: "Somente contas empresa podem conectar Stripe Connect."
        }
      }
    });

    expect(html).toContain('data-testid="billing-not-company"');
    expect(html).toContain('data-testid="billing-connect-not-company"');
    expect(html).toContain('data-testid="billing-kpis-not-company"');
    expect(html).toContain('data-testid="billing-report-not-company"');
    expect(html).toContain('data-testid="billing-state">not-company');
  });

  it("renders KPI/report loaded branches with filters and pagination metadata", () => {
    const html = renderBillingPage({
      ...baseCompanyViewModel,
      billing: {
        state: "loaded",
        rules: [],
        financialKpis: { state: "loaded", grossRevenueCents: 8200, netRevenueCents: 5740 },
        report: {
          state: "loaded",
          filters: { periodStart: "2026-02-01T00:00:00.000Z", periodEnd: "2026-02-10T00:00:00.000Z", page: 2, limit: 1 },
          data: {
            generatedAt: "2026-02-10T00:01:00.000Z",
            periodStart: "2026-02-01T00:00:00.000Z",
            periodEnd: "2026-02-10T00:00:00.000Z",
            page: 2,
            limit: 1,
            totalRows: 3,
            totalPages: 3,
            totals: { grossRevenueCents: 8200, netRevenueCents: 5740 },
            rows: [
              {
                deliveryId: "550e8400-e29b-41d4-a716-446655440099",
                companyId: "550e8400-e29b-41d4-a716-446655440000",
                deliveredAt: "2026-02-04T12:00:00.000Z",
                region: "sudeste",
                deliveryType: "bike",
                weightGrams: 1200,
                matchedRuleId: null,
                priceDiagnostic: "pricing_rule_fallback_used",
                grossRevenueCents: 4100,
                netRevenueCents: 2870
              }
            ]
          }
        },
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

    expect(html).toContain('data-testid="billing-kpis-state">loaded');
    expect(html).toContain('data-testid="billing-kpi-gross"');
    expect(html).toContain('data-testid="billing-kpi-net"');
    expect(html).toContain('data-testid="billing-report-state">loaded');
    expect(html).toContain('data-testid="billing-report-filter-form"');
    expect(html).toContain('data-testid="billing-report-table"');
    expect(html).toContain('data-testid="billing-report-row-550e8400-e29b-41d4-a716-446655440099"');
    expect(html).toContain('data-testid="billing-report-diagnostic-550e8400-e29b-41d4-a716-446655440099"');
    expect(html).toContain('data-testid="billing-report-pagination"');
    expect(html).toContain('data-testid="billing-report-totals"');
    expect(html).toContain('data-testid="billing-filter-page"');
    expect(html).toContain('name="page" value="2"');
    expect(html).toContain('data-testid="billing-filter-limit"');
    expect(html).toContain('name="limit" value="1"');
  });

  it("keeps pricing rules and connect panels visible when report fetch fails", () => {
    const html = renderBillingPage({
      ...baseCompanyViewModel,
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
            stripeProductId: "prod_sendro_440011",
            stripePriceId: "price_sendro_2590",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        financialKpis: { state: "error", error: "trpc_deliveries_operationsSummary_failed:500:boom" },
        report: {
          state: "error",
          filters: { periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-31T23:59:59.999Z", page: 1, limit: 50 },
          error: "trpc_billing_report_failed:500:boom"
        },
        connect: { state: "error", error: "trpc_billing_connectStatus_failed:500:boom" }
      }
    });

    expect(html).toContain('data-testid="billing-report-error"');
    expect(html).toContain('data-testid="billing-kpis-error"');
    expect(html).toContain('data-testid="billing-connect-error"');
    expect(html).toContain('data-testid="billing-form"');
    expect(html).toContain('data-testid="billing-rules-table"');
    expect(html).toContain('data-testid="billing-rule-stripe-product-550e8400-e29b-41d4-a716-446655440011">prod_sendro_440011');
    expect(html).toContain('data-testid="billing-rule-stripe-price-550e8400-e29b-41d4-a716-446655440011">price_sendro_2590');
  });

  it("renders report empty branch and pricing loaded branch independently", () => {
    const html = renderBillingPage({
      ...baseCompanyViewModel,
      billing: {
        state: "loaded",
        rules: [
          {
            ruleId: "550e8400-e29b-41d4-a716-446655440012",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            region: "sudeste",
            deliveryType: "bike",
            weightMinGrams: 0,
            weightMaxGrams: 5000,
            amountCents: 1290,
            currency: "BRL",
            stripeProductId: null,
            stripePriceId: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        financialKpis: { state: "empty", grossRevenueCents: 0, netRevenueCents: 0 },
        report: {
          state: "empty",
          filters: { periodStart: "2026-03-01T00:00:00.000Z", periodEnd: "2026-03-02T00:00:00.000Z", page: 1, limit: 25 },
          data: {
            generatedAt: "2026-03-02T00:00:00.000Z",
            periodStart: "2026-03-01T00:00:00.000Z",
            periodEnd: "2026-03-02T00:00:00.000Z",
            page: 1,
            limit: 25,
            totalRows: 0,
            totalPages: 0,
            totals: { grossRevenueCents: 0, netRevenueCents: 0 },
            rows: []
          }
        },
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

    expect(html).toContain('data-testid="billing-report-empty"');
    expect(html).toContain('data-testid="billing-kpis-empty"');
    expect(html).toContain('data-testid="billing-rules-table"');
    expect(html).toContain('data-testid="billing-rule-stripe-product-550e8400-e29b-41d4-a716-446655440012">n/a');
    expect(html).toContain('data-testid="billing-rule-stripe-price-550e8400-e29b-41d4-a716-446655440012">n/a');
  });
});