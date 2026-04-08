import { buildApp } from "../apps/api/src/index";
import { server as dashboardServer, startDashboard } from "../apps/dashboard/src/server";

type TrpcEnvelope = {
  result?: { data?: { json?: unknown } | unknown };
  error?: { json?: { message?: string } | null; message?: string | null } | null;
};

type ConnectStatus = {
  companyId: string;
  stripeAccountId: string | null;
  status: "not_connected" | "pending_requirements" | "connected";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  connectedAt: string | null;
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

const getTrpc = async (path: string, cookie: string) => {
  const endpoint = `${apiUrl}/trpc/${path}`;
  const response = await withTimeout(`timeout:${path}`, endpoint, fetch(endpoint, { headers: { cookie, origin } }));
  const body = await readJson(`malformed:${path}`, response);
  return { response, body };
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
  return { response, body };
};

const registerCompany = async (suffix: number) => {
  const response = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      name: "Connect Verifier Company",
      email: `connect-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "Connect Verifier Company"
    }),
    redirect: "manual"
  });

  if (!response.ok) {
    fail("signup", { status: response.status, body: await response.text() });
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    fail("signup", { error: "signup_cookie_missing" });
  }

  return cookie;
};

const canReuseDashboard = async () => {
  try {
    const response = await fetch(`${dashboardUrl}/login`, { headers: { origin } });
    if (!response.ok) return false;

    const html = await response.text();
    return html.includes("Login Sendro") && html.includes('action="/login"');
  } catch {
    return false;
  }
};

const closeDashboard = async () =>
  new Promise<void>((resolve, reject) => {
    dashboardServer.close((error) => (error ? reject(error) : resolve()));
  });

const assertConnectStatus = (
  observed: unknown,
  expected: {
    status: ConnectStatus["status"];
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    connectedAt: "null" | "iso";
    stripeAccountRequired?: boolean;
  },
  phaseName: string
): ConnectStatus => {
  const status = observed as ConnectStatus;

  if (!status || typeof status !== "object") {
    fail(phaseName, { error: "status_missing", observed });
  }

  if (status.status !== expected.status) {
    fail(phaseName, { error: "status_mismatch", expected: expected.status, observed: status.status, snapshot: status });
  }

  if (status.chargesEnabled !== expected.chargesEnabled || status.payoutsEnabled !== expected.payoutsEnabled) {
    fail(phaseName, {
      error: "capability_mismatch",
      expectedChargesEnabled: expected.chargesEnabled,
      expectedPayoutsEnabled: expected.payoutsEnabled,
      observedChargesEnabled: status.chargesEnabled,
      observedPayoutsEnabled: status.payoutsEnabled,
      snapshot: status
    });
  }

  if (expected.connectedAt === "null" && status.connectedAt !== null) {
    fail(phaseName, { error: "connected_at_should_be_null", observed: status.connectedAt, snapshot: status });
  }

  if (expected.connectedAt === "iso") {
    if (!status.connectedAt) {
      fail(phaseName, { error: "connected_at_missing", snapshot: status });
    }

    const parsed = Number(new Date(status.connectedAt).getTime());
    if (!Number.isFinite(parsed)) {
      fail(phaseName, { error: "connected_at_invalid_iso", observed: status.connectedAt, snapshot: status });
    }
  }

  if (expected.stripeAccountRequired && !status.stripeAccountId) {
    fail(phaseName, { error: "stripe_account_missing", snapshot: status });
  }

  return status;
};

const postWebhook = async (event: Record<string, unknown>) => {
  const response = await withTimeout(
    "timeout:webhook",
    `${apiUrl}/api/stripe/webhook`,
    fetch(`${apiUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "stub_signature_valid"
      },
      body: JSON.stringify(event)
    })
  );

  const body = (await response.json()) as { ok?: boolean; handled?: boolean; error?: string };
  if (!response.ok || body.ok !== true) {
    fail("webhook", { status: response.status, body });
  }

  return body;
};

const main = async () => {
  const app = await buildApp();
  await app.listen({ port: 3001, host: "127.0.0.1" });

  const dashboardOwnedByVerifier = !(await canReuseDashboard());
  if (dashboardOwnedByVerifier) {
    await startDashboard();
  }

  try {
    const suffix = Date.now();
    const cookie = await registerCompany(suffix);

    const onboardingKick = await postTrpc("billing.connectStripe", cookie, {
      refreshUrl: `${dashboardUrl}/dashboard/billing?connect=refresh`,
      returnUrl: `${dashboardUrl}/dashboard/billing?connect=return`
    });

    if (!onboardingKick.response.ok) {
      fail("onboarding", { status: onboardingKick.response.status, body: onboardingKick.body });
    }

    const onboarding = trpcData(onboardingKick.body) as {
      accountId: string;
      onboardingUrl: string;
      status: "pending_requirements" | "connected";
    };

    if (!onboarding?.onboardingUrl || !onboarding.onboardingUrl.includes("stub_connect=1")) {
      fail("onboarding", { error: "missing_stub_redirect", onboarding });
    }

    const statusAfterOnboardingResponse = await getTrpc("billing.connectStatus", cookie);
    if (!statusAfterOnboardingResponse.response.ok) {
      fail("onboarding", { error: "connect_status_http_error", status: statusAfterOnboardingResponse.response.status });
    }

    const pendingStatus = assertConnectStatus(
      trpcData(statusAfterOnboardingResponse.body),
      {
        status: "pending_requirements",
        chargesEnabled: false,
        payoutsEnabled: false,
        connectedAt: "null",
        stripeAccountRequired: true
      },
      "onboarding"
    );

    phase("onboarding", {
      accountId: pendingStatus.stripeAccountId,
      onboardingStatus: onboarding.status,
      redirectHost: new URL(onboarding.onboardingUrl).host,
      status: pendingStatus.status,
      chargesEnabled: pendingStatus.chargesEnabled,
      payoutsEnabled: pendingStatus.payoutsEnabled,
      connectedAt: pendingStatus.connectedAt
    });

    await postWebhook({
      id: `evt_connect_partial_${suffix}`,
      object: "event",
      type: "account.updated",
      data: {
        object: {
          id: pendingStatus.stripeAccountId,
          object: "account",
          charges_enabled: true,
          payouts_enabled: false
        }
      }
    });

    const partialStatusResponse = await getTrpc("billing.connectStatus", cookie);
    if (!partialStatusResponse.response.ok) {
      fail("webhook-partial", {
        error: "connect_status_http_error",
        status: partialStatusResponse.response.status
      });
    }

    const partialStatus = assertConnectStatus(
      trpcData(partialStatusResponse.body),
      {
        status: "pending_requirements",
        chargesEnabled: true,
        payoutsEnabled: false,
        connectedAt: "null",
        stripeAccountRequired: true
      },
      "webhook-partial"
    );

    phase("webhook-partial", {
      accountId: partialStatus.stripeAccountId,
      status: partialStatus.status,
      chargesEnabled: partialStatus.chargesEnabled,
      payoutsEnabled: partialStatus.payoutsEnabled,
      connectedAt: partialStatus.connectedAt
    });

    await postWebhook({
      id: `evt_connect_full_${suffix}`,
      object: "event",
      type: "account.updated",
      data: {
        object: {
          id: partialStatus.stripeAccountId,
          object: "account",
          charges_enabled: true,
          payouts_enabled: true
        }
      }
    });

    const finalStatusResponse = await getTrpc("billing.connectStatus", cookie);
    if (!finalStatusResponse.response.ok) {
      fail("webhook-final", {
        error: "connect_status_http_error",
        status: finalStatusResponse.response.status
      });
    }

    const finalStatus = assertConnectStatus(
      trpcData(finalStatusResponse.body),
      {
        status: "connected",
        chargesEnabled: true,
        payoutsEnabled: true,
        connectedAt: "iso",
        stripeAccountRequired: true
      },
      "webhook-final"
    );

    phase("webhook-final", {
      accountId: finalStatus.stripeAccountId,
      status: finalStatus.status,
      chargesEnabled: finalStatus.chargesEnabled,
      payoutsEnabled: finalStatus.payoutsEnabled,
      connectedAt: finalStatus.connectedAt
    });

    phase("proof", {
      chargesEnabled: finalStatus.chargesEnabled,
      payoutsEnabled: finalStatus.payoutsEnabled,
      connected: finalStatus.status === "connected",
      connectedAt: finalStatus.connectedAt
    });
  } finally {
    if (dashboardOwnedByVerifier) {
      await closeDashboard();
    }
    await app.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
