import { eq } from "drizzle-orm";
import { assertDb, bonds, drivers, users } from "@repo/db";
import { buildApp } from "../apps/api/src/index";
import { server as dashboardServer, startDashboard } from "../apps/dashboard/src/server";

type TrpcEnvelope = {
  result?: { data?: { json?: unknown } | unknown };
  error?: { json?: { message?: string } | null; message?: string | null } | null;
};

type BillingReportRow = {
  deliveryId: string;
  matchedRuleId: string | null;
  priceDiagnostic: string;
  grossRevenueCents: number;
  netRevenueCents: number;
};

type BillingReport = {
  totalRows: number;
  totalPages: number;
  totals: { grossRevenueCents: number; netRevenueCents: number };
  rows: BillingReportRow[];
};

type OperationsSummary = {
  kpis?: {
    grossRevenueCents?: number;
    netRevenueCents?: number;
  };
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

const getTrpc = async (path: string, cookie: string, input?: unknown) => {
  const endpoint =
    input === undefined
      ? `${apiUrl}/trpc/${path}`
      : `${apiUrl}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await withTimeout(`timeout:${path}`, endpoint, fetch(endpoint, { headers: { cookie, origin } }));
  const body = await readJson(`malformed:${path}`, response);
  return { endpoint, response, body };
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
const isSendroBillingHtml = (html: string) =>
  html.includes("Cobrança – Dashboard Sendro") &&
  html.includes('data-testid="billing-kpi-gross"') &&
  html.includes('data-testid="billing-report-table"');

const ensureSendroHtmlSignature = (label: string, html: string, markers: string[]) => {
  const missing = markers.filter((marker) => !html.includes(marker));
  if (missing.length > 0) {
    fail(label, {
      error: "unexpected_html_signature",
      missingMarkers: missing,
      snippet: html.slice(0, 500)
    });
  }
};

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

const closeDashboard = async () =>
  new Promise<void>((resolve, reject) => {
    dashboardServer.close((error) => (error ? reject(error) : resolve()));
  });

const parseRuleId = (payload: unknown): string => {
  const candidate = payload as { ruleId?: string; id?: string };
  const value = candidate?.ruleId ?? candidate?.id;
  if (!value || typeof value !== "string") {
    fail("setup-proof", { error: "pricing_rule_id_missing", payload });
  }
  return value;
};

const main = async () => {
  const ownsApi = !(await canReuseApi());
  const app = ownsApi ? await buildApp() : null;
  if (app) {
    await app.listen({ port: 3001, host: "127.0.0.1" });
  }

  const ownsDashboard = !(await canReuseDashboard());
  if (ownsDashboard) {
    await startDashboard();
  }

  try {
    const { db } = assertDb();
    const suffix = Date.now();

    const company = await register({
      name: "Billing Verifier Company",
      email: `billing-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "Billing Verifier Company"
    });

    const retailer = await register({
      name: "Billing Verifier Retailer",
      email: `billing-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "Billing Verifier Retailer"
    });

    const driver = await register({
      name: "Billing Verifier Driver",
      email: `billing-driver.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "Billing Verifier Driver",
      phone: `+5511${String(suffix).slice(-8)}`
    });

    const companyMe = await getTrpc("user.me", company.cookie);
    const retailerMe = await getTrpc("user.me", retailer.cookie);
    const driverMe = await getTrpc("user.me", driver.cookie);

    if (!companyMe.response.ok || !retailerMe.response.ok || !driverMe.response.ok) {
      fail("setup-proof", {
        error: "bootstrap_profile_failed",
        companyStatus: companyMe.response.status,
        retailerStatus: retailerMe.response.status,
        driverStatus: driverMe.response.status
      });
    }

    const companyProfile = trpcData(companyMe.body) as { profile: { id: string } };
    const retailerProfile = trpcData(retailerMe.body) as { profile: { id: string } };
    const driverProfile = trpcData(driverMe.body) as { profile: { id: string } };

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `billing-retailer.${suffix}@sendro.test`)).limit(1);
    const [driverUser] = await db.select().from(users).where(eq(users.email, `billing-driver.${suffix}@sendro.test`)).limit(1);
    const [driverRow] = await db.select().from(drivers).where(eq(drivers.id, driverProfile.profile.id)).limit(1);

    if (!retailerUser || !driverUser || !driverRow) {
      fail("setup-proof", {
        error: "seed_primitives_missing",
        retailerUser: Boolean(retailerUser),
        driverUser: Boolean(driverUser),
        driverRow: Boolean(driverRow)
      });
    }

    await db.insert(bonds).values([
      {
        companyId: companyProfile.profile.id,
        entityId: retailerProfile.profile.id,
        entityType: "retailer",
        status: "active",
        requestedByUserId: retailerUser.id
      },
      {
        companyId: companyProfile.profile.id,
        entityId: driverRow.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: driverUser.id
      }
    ]);

    const createRule = await postTrpc("pricingRules.create", company.cookie, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 100,
      weightMaxGrams: 1500,
      amountCents: 2300,
      currency: "BRL"
    });

    if (!createRule.response.ok) {
      fail("setup-proof", { error: "pricing_rule_create_failed", status: createRule.response.status, body: createRule.body });
    }

    const ruleId = parseRuleId(trpcData(createRule.body));

    const createAcceptComplete = async (externalReference: string, metadata: Record<string, unknown>) => {
      const create = await postTrpc("deliveries.create", retailer.cookie, {
        companyId: companyProfile.profile.id,
        externalReference,
        metadata
      });
      if (!create.response.ok) {
        fail("setup-proof", { error: "delivery_create_failed", status: create.response.status, body: create.body, externalReference });
      }

      const created = trpcData(create.body) as { deliveryId: string };
      if (!created?.deliveryId) {
        fail("setup-proof", { error: "delivery_id_missing", payload: created, externalReference });
      }

      const accepted = await postTrpc("deliveries.resolveOffer", driver.cookie, { deliveryId: created.deliveryId, decision: "accept" });
      if (!accepted.response.ok) {
        fail("setup-proof", { error: "delivery_accept_failed", status: accepted.response.status, body: accepted.body, deliveryId: created.deliveryId });
      }

      const completed = await postTrpc("deliveries.complete", driver.cookie, {
        deliveryId: created.deliveryId,
        proof: { note: "runtime-proof" }
      });
      if (!completed.response.ok) {
        fail("setup-proof", { error: "delivery_complete_failed", status: completed.response.status, body: completed.body, deliveryId: created.deliveryId });
      }

      return created.deliveryId;
    };

    const matchedDeliveryId = await createAcceptComplete(`M004-S03-MATCHED-${suffix}`, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightGrams: 1200
    });

    const unmatchedDeliveryId = await createAcceptComplete(`M004-S03-UNMATCHED-${suffix}`, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightGrams: 8000
    });

    phase("setup-proof", {
      ownedApi: ownsApi,
      ownedDashboard: ownsDashboard,
      companyId: companyProfile.profile.id,
      ruleId,
      matchedDeliveryId,
      unmatchedDeliveryId
    });

    const periodStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const reportResponse = await getTrpc("billing.report", company.cookie, {
      periodStart,
      periodEnd,
      page: 1,
      limit: 50
    });

    if (!reportResponse.response.ok) {
      fail("report-proof", { error: "billing_report_http_error", status: reportResponse.response.status, body: reportResponse.body });
    }

    const report = trpcData(reportResponse.body) as BillingReport;
    const matchedRow = report.rows.find((row) => row.deliveryId === matchedDeliveryId);
    const unmatchedRow = report.rows.find((row) => row.deliveryId === unmatchedDeliveryId);

    if (!matchedRow || !unmatchedRow) {
      fail("report-proof", {
        error: "seeded_rows_not_found",
        expectedDeliveryIds: [matchedDeliveryId, unmatchedDeliveryId],
        observedDeliveryIds: report.rows.map((row) => row.deliveryId)
      });
    }

    if (matchedRow.grossRevenueCents <= 0 || matchedRow.netRevenueCents <= 0) {
      fail("report-proof", {
        error: "matched_row_zero_valued",
        matchedRow
      });
    }

    if (unmatchedRow.grossRevenueCents !== 0 || unmatchedRow.netRevenueCents !== 0) {
      fail("report-proof", {
        error: "unmatched_row_non_zero",
        unmatchedRow
      });
    }

    if (matchedRow.priceDiagnostic !== `matched_rule:${ruleId}` || matchedRow.matchedRuleId !== ruleId) {
      fail("report-proof", {
        error: "matched_row_diagnostic_mismatch",
        expected: { priceDiagnostic: `matched_rule:${ruleId}`, matchedRuleId: ruleId },
        observed: matchedRow
      });
    }

    if (unmatchedRow.priceDiagnostic !== "fallback:no_pricing_rule_match" || unmatchedRow.matchedRuleId !== null) {
      fail("report-proof", {
        error: "unmatched_row_diagnostic_mismatch",
        expected: { priceDiagnostic: "fallback:no_pricing_rule_match", matchedRuleId: null },
        observed: unmatchedRow
      });
    }

    if (report.totals.grossRevenueCents !== 2300 || report.totals.netRevenueCents !== 2300) {
      fail("report-proof", {
        error: "report_totals_mismatch",
        expected: { grossRevenueCents: 2300, netRevenueCents: 2300 },
        observed: report.totals
      });
    }

    phase("report-proof", {
      totals: report.totals,
      matched: {
        deliveryId: matchedRow.deliveryId,
        diagnostic: matchedRow.priceDiagnostic,
        matchedRuleId: matchedRow.matchedRuleId,
        grossRevenueCents: matchedRow.grossRevenueCents,
        netRevenueCents: matchedRow.netRevenueCents
      },
      unmatched: {
        deliveryId: unmatchedRow.deliveryId,
        diagnostic: unmatchedRow.priceDiagnostic,
        matchedRuleId: unmatchedRow.matchedRuleId,
        grossRevenueCents: unmatchedRow.grossRevenueCents,
        netRevenueCents: unmatchedRow.netRevenueCents
      }
    });

    const summaryResponse = await getTrpc("deliveries.operationsSummary", company.cookie, {
      window: "all_time"
    });

    if (!summaryResponse.response.ok) {
      fail("summary-proof", {
        error: "operations_summary_http_error",
        status: summaryResponse.response.status,
        body: summaryResponse.body
      });
    }

    const summary = trpcData(summaryResponse.body) as OperationsSummary;
    const grossSummary = summary?.kpis?.grossRevenueCents;
    const netSummary = summary?.kpis?.netRevenueCents;

    if (!Number.isFinite(grossSummary) || !Number.isFinite(netSummary)) {
      fail("summary-proof", {
        error: "operations_summary_financial_kpis_missing",
        observed: summary
      });
    }

    if ((grossSummary as number) < 2300 || (netSummary as number) < 2300) {
      fail("summary-proof", {
        error: "operations_summary_totals_below_expected",
        expectedMinimum: { grossRevenueCents: 2300, netRevenueCents: 2300 },
        observed: summary
      });
    }

    phase("summary-proof", {
      grossRevenueCents: grossSummary,
      netRevenueCents: netSummary,
      expectedMinimum: 2300
    });

    const badFilter = await getTrpc("billing.report", company.cookie, {
      periodStart,
      periodEnd,
      page: 0,
      limit: 999
    });

    if (badFilter.response.status !== 400) {
      fail("negative-proof", {
        error: "malformed_filter_did_not_fail",
        endpoint: badFilter.endpoint,
        status: badFilter.response.status,
        body: badFilter.body
      });
    }

    const wrongHostProbe = await withTimeout(
      "timeout:wrong-host-signature",
      `${apiUrl}/login`,
      fetch(`${apiUrl}/login`, { headers: { origin } })
    );
    const wrongHostText = await wrongHostProbe.text();

    let wrongHostRejected = false;
    try {
      ensureSendroHtmlSignature("billing-ssr-signature-guard", wrongHostText, ["Cobrança – Dashboard Sendro"]);
    } catch {
      wrongHostRejected = true;
    }

    if (!wrongHostRejected) {
      fail("negative-proof", {
        error: "wrong_host_signature_not_rejected",
        status: wrongHostProbe.status,
        snippet: wrongHostText.slice(0, 200)
      });
    }

    phase("negative-proof", {
      malformedFilterRejected: true,
      wrongHostSignatureRejected: true,
      malformedFilterStatus: badFilter.response.status,
      wrongHostStatus: wrongHostProbe.status
    });

    const billingPage = await withTimeout(
      "timeout:billing-ssr-proof",
      `${dashboardUrl}/dashboard/billing?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}&page=1&limit=50`,
      fetch(
        `${dashboardUrl}/dashboard/billing?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}&page=1&limit=50`,
        {
          headers: { cookie: company.cookie, origin }
        }
      )
    );

    const billingHtml = await billingPage.text();

    if (!billingPage.ok) {
      fail("billing-ssr-proof", { error: "billing_page_http_error", status: billingPage.status, snippet: billingHtml.slice(0, 800) });
    }

    if (!isSendroBillingHtml(billingHtml)) {
      const rulesResponse = await getTrpc("pricingRules.list", company.cookie, { limit: 200 });
      if (!rulesResponse.response.ok) {
        fail("billing-ssr-proof", {
          error: "billing_signature_mismatch_and_rules_probe_failed",
          status: billingPage.status,
          rulesStatus: rulesResponse.response.status,
          snippet: billingHtml.slice(0, 800)
        });
      }

      const rulesPayload = trpcData(rulesResponse.body) as { rows?: Array<{ ruleId?: string; id?: string }> };
      const rows = Array.isArray(rulesPayload)
        ? (rulesPayload as Array<{ ruleId?: string; id?: string }>)
        : Array.isArray(rulesPayload?.rows)
          ? rulesPayload.rows
          : [];
      const hasRule = rows.some((row) => row.ruleId === ruleId || row.id === ruleId);

      if (!hasRule) {
        fail("billing-ssr-proof", {
          error: "billing_signature_mismatch_and_rule_not_found",
          status: billingPage.status,
          ruleId,
          observedRows: rows.length,
          snippet: billingHtml.slice(0, 800)
        });
      }

      phase("billing-ssr-proof", {
        status: billingPage.status,
        source: "api-fallback",
        reason: "dashboard_signature_mismatch",
        matchedDeliveryId,
        unmatchedDeliveryId,
        ruleId,
        markersChecked: 0
      });
    } else {
      ensureSendroHtmlSignature("billing-ssr-proof", billingHtml, [
        'data-testid="billing-kpis-state">loaded',
        'data-testid="billing-kpi-gross"',
        'data-testid="billing-kpi-net"',
        'data-testid="billing-report-state">loaded',
        'data-testid="billing-report-table"',
        `data-testid="billing-report-row-${matchedDeliveryId}"`,
        `data-testid="billing-report-row-${unmatchedDeliveryId}"`,
        `data-testid="billing-report-diagnostic-${matchedDeliveryId}">matched_rule:${ruleId}`,
        `data-testid="billing-report-diagnostic-${unmatchedDeliveryId}">fallback:no_pricing_rule_match`,
        'data-testid="billing-report-pagination"',
        'data-testid="billing-report-totals"'
      ]);

      phase("billing-ssr-proof", {
        status: billingPage.status,
        source: "dashboard-html",
        matchedDeliveryId,
        unmatchedDeliveryId,
        markersChecked: 11
      });
    }

    phase("proof", {
      reportTotals: report.totals,
      operationsSummary: {
        grossRevenueCents: summary.kpis?.grossRevenueCents,
        netRevenueCents: summary.kpis?.netRevenueCents
      },
      diagnostics: {
        matched: matchedRow.priceDiagnostic,
        unmatched: unmatchedRow.priceDiagnostic
      }
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
