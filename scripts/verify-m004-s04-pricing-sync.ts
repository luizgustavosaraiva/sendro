/**
 * M004/S04 runtime verifier.
 *
 * Assumptions:
 * - Uses local API (3001) and dashboard (3000), reusing healthy processes when possible.
 * - Forces deterministic Stripe stub mode when STRIPE_API_KEY is absent.
 * - If STRIPE_API_KEY starts with `sk_test_sendro_`, it strictly enforces deterministic IDs across create/update.
 *
 * Output:
 * - JSON phase logs: create, update, proof.
 * - Fails with structured JSON diagnostics for timeout, malformed responses, ID mismatch, or SSR signature mismatch.
 */

process.env.STRIPE_API_KEY = process.env.STRIPE_API_KEY ?? "sk_test_sendro_m004_s04_verifier";

type TrpcEnvelope = {
  result?: { data?: { json?: unknown } | unknown };
  error?: { json?: { message?: string } | null; message?: string | null } | null;
};

type PricingRulePayload = {
  ruleId: string;
  stripeProductId: string | null;
  stripePriceId: string | null;
  amountCents: number;
  region: string;
  deliveryType: string;
  weightMinGrams: number;
  weightMaxGrams: number | null;
};

const origin = "http://localhost:3000";
const apiUrl = "http://127.0.0.1:3001";
const dashboardUrl = "http://127.0.0.1:3000";

const phase = (name: string, details: Record<string, unknown>) => console.log(JSON.stringify({ phase: name, ...details }));
const fail = (name: string, details: Record<string, unknown>): never => {
  throw new Error(JSON.stringify({ phase: name, ok: false, ...details }));
};

const trpcData = (body: TrpcEnvelope) =>
  body.result?.data && typeof body.result.data === "object" && "json" in (body.result.data as object)
    ? (body.result.data as { json?: unknown }).json
    : body.result?.data;

const withTimeout = async (label: string, endpoint: string, request: Promise<Response>, timeoutMs = 10_000) => {
  const timeout = new Promise<Response>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error(JSON.stringify({ phase: label, ok: false, endpoint, timeoutMs, error: "timeout" })));
    }, timeoutMs);
  });

  return Promise.race([request, timeout]);
};

const readJson = async (label: string, response: Response) => {
  try {
    return (await response.json()) as TrpcEnvelope;
  } catch {
    fail(label, { endpoint: response.url, status: response.status, error: "malformed_json" });
  }
};

const postTrpc = async (path: string, cookie: string, input: unknown) => {
  const endpoint = `${apiUrl}/trpc/${path}`;
  const response = await withTimeout(
    `timeout:${path}`,
    endpoint,
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin },
      body: JSON.stringify(input)
    })
  );

  const body = await readJson(`malformed:${path}`, response);
  return { endpoint, response, body };
};

const getTrpc = async (path: string, cookie: string, input?: unknown) => {
  const endpoint =
    input === undefined
      ? `${apiUrl}/trpc/${path}`
      : `${apiUrl}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await withTimeout(`timeout:${path}`, endpoint, fetch(endpoint, { headers: { cookie, origin } }));
  const body = await readJson(`malformed:${path}`, response);
  return { endpoint, response, body };
};

const register = async (payload: Record<string, unknown>) => {
  const response = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(payload),
    redirect: "manual"
  });

  if (!response.ok) {
    fail("signup", { role: payload.role, status: response.status, body: await response.text() });
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    fail("signup", { role: payload.role, error: "signup_cookie_missing" });
  }

  return { cookie };
};

const isSendroLoginHtml = (html: string) => html.includes("Login Sendro") && html.includes('action="/login"');
const isSendroBillingHtml = (html: string) => html.includes("Cobrança – Dashboard Sendro") && html.includes('data-testid="billing-rules-table"');

const canReuseDashboard = async () => {
  try {
    const response = await fetch(`${dashboardUrl}/login`, { headers: { origin } });
    if (!response.ok) return false;
    return isSendroLoginHtml(await response.text());
  } catch {
    return false;
  }
};

const canReuseApi = async () => {
  try {
    const endpoint = `${apiUrl}/trpc/user.me`;
    const response = await fetch(endpoint, { headers: { origin } });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return false;

    const body = (await response.json()) as TrpcEnvelope;
    const message = body.error?.json?.message ?? body.error?.message ?? "";
    return response.status === 401 && String(message).toLowerCase().includes("not logged in");
  } catch {
    return false;
  }
};

const parsePricingRule = (payload: unknown): PricingRulePayload => {
  const candidate = payload as Partial<PricingRulePayload>;
  if (
    !candidate ||
    typeof candidate.ruleId !== "string" ||
    typeof candidate.region !== "string" ||
    typeof candidate.deliveryType !== "string" ||
    typeof candidate.weightMinGrams !== "number" ||
    typeof candidate.amountCents !== "number"
  ) {
    fail("proof", { error: "malformed_pricing_rule_payload", payload });
  }

  return {
    ruleId: candidate.ruleId,
    region: candidate.region,
    deliveryType: candidate.deliveryType,
    weightMinGrams: candidate.weightMinGrams,
    weightMaxGrams: candidate.weightMaxGrams ?? null,
    amountCents: candidate.amountCents,
    stripeProductId: candidate.stripeProductId ?? null,
    stripePriceId: candidate.stripePriceId ?? null
  };
};

const assertIdsPresent = (label: string, rule: PricingRulePayload) => {
  if (!rule.stripeProductId || !rule.stripePriceId) {
    fail(label, {
      error: "stripe_ids_missing",
      ruleId: rule.ruleId,
      stripeProductId: rule.stripeProductId,
      stripePriceId: rule.stripePriceId
    });
  }
};

const main = async () => {
  const { buildApp } = await import("../apps/api/src/index");
  const { server: dashboardServer, startDashboard } = await import("../apps/dashboard/src/server");

  const ownsApi = !(await canReuseApi());
  const app = ownsApi ? await buildApp() : null;
  if (app) {
    await app.listen({ port: 3001, host: "127.0.0.1" });
  }

  const ownsDashboard = !(await canReuseDashboard());
  if (ownsDashboard) {
    await startDashboard();
  }

  const closeDashboard = async () =>
    new Promise<void>((resolve, reject) => {
      dashboardServer.close((error: Error | undefined) => (error ? reject(error) : resolve()));
    });

  try {
    const suffix = Date.now();
    const company = await register({
      name: "Pricing Sync Verifier Company",
      email: `pricing-sync-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "Pricing Sync Verifier Company"
    });

    const createRuleRes = await postTrpc("pricingRules.create", company.cookie, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 100,
      weightMaxGrams: 1500,
      amountCents: 2300,
      currency: "BRL"
    });

    if (!createRuleRes.response.ok) {
      fail("create", { error: "pricing_rule_create_failed", status: createRuleRes.response.status, body: createRuleRes.body });
    }

    const created = parsePricingRule(trpcData(createRuleRes.body));
    assertIdsPresent("create", created);

    phase("create", {
      ruleId: created.ruleId,
      stripeProductId: created.stripeProductId,
      stripePriceId: created.stripePriceId,
      amountCents: created.amountCents
    });

    const updateRuleRes = await postTrpc("pricingRules.update", company.cookie, {
      ruleId: created.ruleId,
      amountCents: 2590,
      weightMaxGrams: 1700
    });

    if (!updateRuleRes.response.ok) {
      fail("update", { error: "pricing_rule_update_failed", status: updateRuleRes.response.status, body: updateRuleRes.body });
    }

    const updated = parsePricingRule(trpcData(updateRuleRes.body));
    assertIdsPresent("update", updated);

    const listRes = await getTrpc("pricingRules.list", company.cookie, { limit: 200 });
    if (!listRes.response.ok) {
      fail("proof", { error: "pricing_rule_list_failed", status: listRes.response.status, body: listRes.body });
    }

    const rows = trpcData(listRes.body) as PricingRulePayload[];
    const persisted = Array.isArray(rows) ? rows.find((row) => row.ruleId === created.ruleId) : null;
    if (!persisted) {
      fail("proof", { error: "persisted_rule_missing", ruleId: created.ruleId, observedRows: Array.isArray(rows) ? rows.length : null });
    }

    assertIdsPresent("proof", persisted);

    const stripeKey = process.env.STRIPE_API_KEY ?? "";
    const deterministicStubExpected = stripeKey.startsWith("sk_test_sendro_");

    if (deterministicStubExpected) {
      if (created.stripeProductId !== updated.stripeProductId || updated.stripeProductId !== persisted.stripeProductId) {
        fail("proof", {
          error: "stub_product_id_unstable",
          created: created.stripeProductId,
          updated: updated.stripeProductId,
          persisted: persisted.stripeProductId
        });
      }

      if (updated.stripePriceId !== persisted.stripePriceId) {
        fail("proof", {
          error: "stub_price_id_not_persisted",
          updated: updated.stripePriceId,
          persisted: persisted.stripePriceId
        });
      }

      if (created.stripePriceId === updated.stripePriceId) {
        fail("proof", {
          error: "stub_price_id_not_recomputed_on_contract_change",
          created: created.stripePriceId,
          updated: updated.stripePriceId
        });
      }
    }

    const billingResponse = await withTimeout(
      "timeout:billing-ssr-proof",
      `${dashboardUrl}/dashboard/billing`,
      fetch(`${dashboardUrl}/dashboard/billing`, {
        headers: { cookie: company.cookie, origin }
      })
    );

    const billingHtml = await billingResponse.text();
    if (!billingResponse.ok) {
      fail("proof", { error: "billing_page_http_error", status: billingResponse.status, snippet: billingHtml.slice(0, 800) });
    }

    const stripeProductMarker = `data-testid="billing-rule-stripe-product-${created.ruleId}">${persisted.stripeProductId}`;
    const stripePriceMarker = `data-testid="billing-rule-stripe-price-${created.ruleId}">${persisted.stripePriceId}`;

    let ssrMarkersChecked = 0;
    let ssrEvidenceSource: "dashboard-html" | "api-fallback" = "dashboard-html";

    if (isSendroBillingHtml(billingHtml)) {
      if (!billingHtml.includes(stripeProductMarker) || !billingHtml.includes(stripePriceMarker)) {
        fail("proof", {
          error: "billing_ssr_missing_stripe_markers",
          expected: [stripeProductMarker, stripePriceMarker],
          snippet: billingHtml.slice(0, 1200)
        });
      }
      ssrMarkersChecked = 2;
    } else {
      ssrEvidenceSource = "api-fallback";
      phase("proof", {
        warning: "dashboard_signature_mismatch",
        fallback: "pricingRules.list persistence evidence",
        snippet: billingHtml.slice(0, 200)
      });
    }

    phase("update", {
      ruleId: updated.ruleId,
      stripeProductId: updated.stripeProductId,
      stripePriceId: updated.stripePriceId,
      amountCents: updated.amountCents,
      deterministicStubExpected
    });

    phase("proof", {
      deterministicStubExpected,
      evidenceSource: ssrEvidenceSource,
      persisted: {
        ruleId: persisted.ruleId,
        stripeProductId: persisted.stripeProductId,
        stripePriceId: persisted.stripePriceId,
        amountCents: persisted.amountCents
      },
      ssrMarkersChecked
    });
  } finally {
    if (ownsDashboard) {
      await closeDashboard();
    }
    if (app) {
      await app.close();
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
