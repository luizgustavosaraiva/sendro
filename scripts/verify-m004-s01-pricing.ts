import { eq } from "drizzle-orm";
import { assertDb, bonds, drivers, users } from "@repo/db";
import { buildApp } from "../apps/api/src/index";
import { server as dashboardServer, startDashboard } from "../apps/dashboard/src/server";

type TrpcEnvelope = {
  result?: { data?: { json?: unknown } | unknown };
  error?: { json?: { message?: string } | null; message?: string | null } | null;
};

const origin = "http://localhost:3000";

const trpcData = (body: TrpcEnvelope) =>
  body.result?.data && typeof body.result.data === "object" && "json" in (body.result.data as object)
    ? (body.result.data as { json?: unknown }).json
    : body.result?.data;

const phase = (name: string, details: Record<string, unknown>) => console.log(JSON.stringify({ phase: name, ...details }));
const fail = (name: string, details: Record<string, unknown>): never => {
  throw new Error(JSON.stringify({ phase: name, ok: false, ...details }));
};

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

const postTrpc = async (baseUrl: string, path: string, cookie: string, input: unknown) => {
  const endpoint = `${baseUrl}/trpc/${path}`;
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
  return { response, body };
};

const getTrpc = async (baseUrl: string, path: string, cookie: string) => {
  const endpoint = `${baseUrl}/trpc/${path}`;
  const response = await withTimeout(`timeout:${path}`, endpoint, fetch(endpoint, { headers: { cookie, origin } }));
  const body = await readJson(`malformed:${path}`, response);
  return { response, body };
};

const register = async (baseUrl: string, payload: Record<string, unknown>) => {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
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

const canReuseDashboard = async () => {
  try {
    const response = await fetch("http://127.0.0.1:3000/login", { headers: { origin } });
    return response.ok;
  } catch {
    return false;
  }
};

const closeDashboard = async () =>
  new Promise<void>((resolve, reject) => {
    dashboardServer.close((error) => (error ? reject(error) : resolve()));
  });

const priceComponentFromDelivery = (delivery: unknown) => {
  const firstCandidate = (delivery as { dispatch?: { latestSnapshot?: Array<{ components?: Array<{ signal: string; value: number; diagnostic?: string }> }> } })
    ?.dispatch?.latestSnapshot?.[0];
  return firstCandidate?.components?.find((component) => component.signal === "price") ?? null;
};

const main = async () => {
  const app = await buildApp();
  await app.listen({ port: 3001, host: "127.0.0.1" });

  const dashboardOwnedByVerifier = !(await canReuseDashboard());
  if (dashboardOwnedByVerifier) {
    await startDashboard();
  }

  const apiUrl = "http://127.0.0.1:3001";
  const dashboardUrl = "http://127.0.0.1:3000";

  try {
    const { db } = assertDb();
    const suffix = Date.now();

    const company = await register(apiUrl, {
      name: "Pricing Verifier Company",
      email: `pricing-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "Pricing Verifier Company"
    });
    const retailer = await register(apiUrl, {
      name: "Pricing Verifier Retailer",
      email: `pricing-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "Pricing Verifier Retailer"
    });
    const driver = await register(apiUrl, {
      name: "Pricing Driver",
      email: `pricing-driver.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "Pricing Driver",
      phone: `+5511${String(suffix).slice(-8)}`
    });

    const companyMe = await getTrpc(apiUrl, "user.me", company.cookie);
    const driverMe = await getTrpc(apiUrl, "user.me", driver.cookie);
    if (!companyMe.response.ok || !driverMe.response.ok) {
      fail("bootstrap", { companyStatus: companyMe.response.status, driverStatus: driverMe.response.status });
    }

    const companyProfile = trpcData(companyMe.body) as { profile: { id: string } };
    const driverProfile = trpcData(driverMe.body) as { profile: { id: string } };

    const [driverUser] = await db.select().from(users).where(eq(users.email, `pricing-driver.${suffix}@sendro.test`)).limit(1);
    const [driverRow] = await db.select().from(drivers).where(eq(drivers.id, driverProfile.profile.id)).limit(1);
    if (!driverUser || !driverRow) {
      fail("bootstrap", { driverUser: Boolean(driverUser), driverRow: Boolean(driverRow) });
    }

    await db.insert(bonds).values({
      companyId: companyProfile.profile.id,
      entityId: driverRow.id,
      entityType: "driver",
      status: "active",
      requestedByUserId: driverUser.id
    });

    const createRule = await postTrpc(apiUrl, "pricingRules.create", company.cookie, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightMinGrams: 100,
      weightMaxGrams: 1500,
      amountCents: 2300,
      currency: "BRL"
    });
    if (!createRule.response.ok) {
      fail("pricing-rule", { status: createRule.response.status, body: createRule.body });
    }
    const createdRule = trpcData(createRule.body) as { ruleId: string };

    const billingPage = await fetch(`${dashboardUrl}/dashboard/billing`, { headers: { cookie: company.cookie, origin } });
    const billingHtml = await billingPage.text();
    if (!billingPage.ok || !billingHtml.includes('data-testid="billing-rules-table"') || !billingHtml.includes(createdRule.ruleId)) {
      fail("billing-html", { status: billingPage.status, snippet: billingHtml.slice(0, 1500) });
    }

    const createDelivery = async (externalReference: string, metadata: Record<string, unknown>) => {
      const response = await postTrpc(apiUrl, "deliveries.create", retailer.cookie, {
        companyId: companyProfile.profile.id,
        externalReference,
        metadata
      });
      if (!response.response.ok) {
        fail("delivery-create", { status: response.response.status, body: response.body });
      }
      return trpcData(response.body);
    };

    const matched = await createDelivery(`pricing-matched-${suffix}`, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightGrams: 1200
    });
    const unmatched = await createDelivery(`pricing-unmatched-${suffix}`, {
      region: "SP-CAPITAL",
      deliveryType: "same_day",
      weightGrams: 3000
    });

    const matchedPrice = priceComponentFromDelivery(matched);
    const unmatchedPrice = priceComponentFromDelivery(unmatched);

    if (!matchedPrice || matchedPrice.value <= 0) fail("price-proof-matched", { matchedPrice });
    if (!unmatchedPrice || unmatchedPrice.value !== 0) fail("price-proof-unmatched", { unmatchedPrice });

    phase("pricing-proof", {
      ruleId: createdRule.ruleId,
      matchedPriceScore: matchedPrice.value,
      matchedDiagnostic: matchedPrice.diagnostic ?? null,
      unmatchedPriceScore: unmatchedPrice.value,
      unmatchedDiagnostic: unmatchedPrice.diagnostic ?? null
    });
  } finally {
    if (dashboardOwnedByVerifier) await closeDashboard();
    await app.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
