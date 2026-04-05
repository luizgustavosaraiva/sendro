import { asc, eq } from "drizzle-orm";
import { assertDb, bonds, deliveryEvents, deliveries, dispatchAttempts, dispatchQueueEntries, drivers, users } from "@repo/db";
import { buildApp } from "../apps/api/src/index";
import { server as dashboardServer, startDashboard } from "../apps/dashboard/src/server";

type CookieJar = { cookie: string };
type TrpcEnvelope = {
  result?: { data?: { json?: unknown } | unknown };
  error?: { json?: { message?: string } | null; message?: string | null } | null;
};

const origin = "http://localhost:3000";
const trpcData = (body: TrpcEnvelope) =>
  body.result?.data && typeof body.result.data === "object" && "json" in (body.result.data as object)
    ? (body.result.data as { json?: unknown }).json
    : body.result?.data;
const trpcErrorMessage = (body: TrpcEnvelope) => body.error?.json?.message ?? body.error?.message ?? "unknown_trpc_error";

const phase = (name: string, details: Record<string, unknown>) => {
  console.log(JSON.stringify({ phase: name, ...details }));
};

const fail = (name: string, details: Record<string, unknown>): never => {
  throw new Error(JSON.stringify({ phase: name, ok: false, ...details }));
};

const expectOk = async (response: Response, code: string) => {
  if (!response.ok) {
    throw new Error(`${code}:${response.status}:${await response.text()}`);
  }
};

const register = async (baseUrl: string, payload: Record<string, unknown>): Promise<CookieJar> => {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(payload),
    redirect: "manual"
  });
  await expectOk(response, `signup_failed:${String(payload.role)}`);
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error(`signup_cookie_missing:${String(payload.role)}`);
  return { cookie };
};

const withTimeout = async (label: string, endpoint: string, request: Promise<Response>, timeoutMs = 10000) => {
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

const getTrpc = async (baseUrl: string, path: string, cookie: string, input?: unknown) => {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const endpoint = `${baseUrl}/trpc/${path}${query}`;
  const response = await withTimeout(
    `timeout:${path}`,
    endpoint,
    fetch(endpoint, { headers: { cookie, origin } })
  );
  const body = await readJson(`malformed:${path}`, response);
  return { response, body, endpoint };
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
  return { response, body, endpoint };
};

const closeDashboard = async () =>
  new Promise<void>((resolve, reject) => {
    dashboardServer.close((error) => {
      if (error) return reject(error);
      resolve();
    });
  });

const canReuseDashboard = async () => {
  try {
    const response = await fetch("http://127.0.0.1:3000/login", { headers: { origin } });
    return response.ok;
  } catch {
    return false;
  }
};

const decodeHtml = (value: string) =>
  value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");

const extractDeliveryId = (html: string) => {
  const match = html.match(/data-testid="retailer-delivery-feedback"[\s\S]*?deliveryId:\s*<code>([^<]+)<\/code>/);
  return match ? decodeHtml(match[1]) : null;
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
      name: "Dispatch Verifier Company",
      email: `dispatch-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "Dispatch Verifier Company"
    });
    const retailer = await register(apiUrl, {
      name: "Dispatch Verifier Retailer",
      email: `dispatch-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "Dispatch Verifier Retailer"
    });
    const driverA = await register(apiUrl, {
      name: "Dispatch Driver A",
      email: `dispatch-driver-a.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "Dispatch Driver A",
      phone: `+5511${String(suffix).slice(-8)}`
    });
    const driverB = await register(apiUrl, {
      name: "Dispatch Driver B",
      email: `dispatch-driver-b.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "Dispatch Driver B",
      phone: `+5521${String(suffix).slice(-8)}`
    });

    const companyMe = await getTrpc(apiUrl, "user.me", company.cookie);
    const retailerMe = await getTrpc(apiUrl, "user.me", retailer.cookie);
    const driverAMe = await getTrpc(apiUrl, "user.me", driverA.cookie);
    const driverBMe = await getTrpc(apiUrl, "user.me", driverB.cookie);
    if (!companyMe.response.ok || !retailerMe.response.ok || !driverAMe.response.ok || !driverBMe.response.ok) {
      fail("bootstrap", {
        companyStatus: companyMe.response.status,
        retailerStatus: retailerMe.response.status,
        driverAStatus: driverAMe.response.status,
        driverBStatus: driverBMe.response.status
      });
    }

    const companyProfile = trpcData(companyMe.body) as { profile: { id: string } };
    const retailerProfile = trpcData(retailerMe.body) as { profile: { id: string } };
    const driverAProfile = trpcData(driverAMe.body) as { profile: { id: string } };
    const driverBProfile = trpcData(driverBMe.body) as { profile: { id: string } };

    const [driverAUser] = await db.select().from(users).where(eq(users.email, `dispatch-driver-a.${suffix}@sendro.test`)).limit(1);
    const [retailerUser] = await db.select().from(users).where(eq(users.email, `dispatch-retailer.${suffix}@sendro.test`)).limit(1);
    const [driverARow] = await db.select().from(drivers).where(eq(drivers.id, driverAProfile.profile.id)).limit(1);
    const [driverBRow] = await db.select().from(drivers).where(eq(drivers.id, driverBProfile.profile.id)).limit(1);
    if (!driverAUser || !retailerUser || !driverARow || !driverBRow) {
      fail("bootstrap", { driverAUser: Boolean(driverAUser), retailerUser: Boolean(retailerUser), driverARow: Boolean(driverARow), driverBRow: Boolean(driverBRow) });
    }

    const requestBond = await postTrpc(apiUrl, "bonds.requestRetailerBond", retailer.cookie, { companyId: companyProfile.profile.id });
    if (!requestBond.response.ok) fail("bond", { status: requestBond.response.status, body: requestBond.body });
    const requestedBond = trpcData(requestBond.body) as { id: string };

    await db.insert(bonds).values([
      {
        companyId: companyProfile.profile.id,
        entityId: driverARow.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: driverAUser.id
      },
      {
        companyId: companyProfile.profile.id,
        entityId: driverBRow.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: driverAUser.id
      }
    ]);

    const approveBond = await postTrpc(apiUrl, "bonds.decideRetailerBond", company.cookie, { bondId: requestedBond.id, action: "approve" });
    if (!approveBond.response.ok) fail("bond", { status: approveBond.response.status, body: approveBond.body, step: "approve" });

    phase("bootstrap", {
      companyId: companyProfile.profile.id,
      retailerId: retailerProfile.profile.id,
      driverAId: driverAProfile.profile.id,
      driverBId: driverBProfile.profile.id
    });

    const createDelivery = await fetch(`${dashboardUrl}/dashboard/deliveries`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: retailer.cookie, origin },
      body: new URLSearchParams({
        companyId: companyProfile.profile.id,
        externalReference: `dispatch-${suffix}`,
        pickupAddress: "Rua Coleta 123",
        dropoffAddress: "Rua Entrega 456",
        notes: "dispatch-verify"
      }).toString(),
      redirect: "manual"
    });
    const createHtml = await createDelivery.text();
    const deliveryId = extractDeliveryId(createHtml);
    if (!createDelivery.ok || !deliveryId) {
      fail("create", { status: createDelivery.status, snippet: createHtml.slice(0, 1500) });
    }

    const createdDetailRes = await getTrpc(apiUrl, "deliveries.detail", retailer.cookie, { deliveryId });
    if (!createdDetailRes.response.ok) fail("create", { step: "detail", status: createdDetailRes.response.status, body: createdDetailRes.body });
    const createdDetail = trpcData(createdDetailRes.body) as { status: string; dispatch: { phase: string; activeAttemptNumber: number; latestSnapshot: Array<{ driverId: string }> } | null };
    if (createdDetail.status !== "offered" || !createdDetail.dispatch || createdDetail.dispatch.phase !== "offered" || createdDetail.dispatch.activeAttemptNumber !== 1 || createdDetail.dispatch.latestSnapshot.length !== 2) {
      fail("create", { createdDetail });
    }

    const activeQueueRes = await getTrpc(apiUrl, "deliveries.dispatchQueue", company.cookie);
    if (!activeQueueRes.response.ok) fail("active-queue", { status: activeQueueRes.response.status, body: activeQueueRes.body });
    const activeQueue = trpcData(activeQueueRes.body) as Array<{ deliveryId: string; dispatch: { phase: string; activeAttemptNumber: number; deadlineAt: string | null } | null }>;
    const activeItem = activeQueue.find((row) => row.deliveryId === deliveryId);
    if (!activeItem || !activeItem.dispatch || activeItem.dispatch.phase !== "offered" || activeItem.dispatch.activeAttemptNumber !== 1 || !activeItem.dispatch.deadlineAt) {
      fail("active-queue", { activeQueue, expectedDeliveryId: deliveryId });
    }

    const companyDashboardBefore = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: company.cookie, origin } });
    const companyDashboardBeforeHtml = await companyDashboardBefore.text();
    if (
      !companyDashboardBefore.ok ||
      !companyDashboardBeforeHtml.includes('data-testid="dispatch-active-list"') ||
      !companyDashboardBeforeHtml.includes(`dispatch-active-card-${deliveryId}`) ||
      !companyDashboardBeforeHtml.includes('data-testid="dispatch-phase">offered')
    ) {
      fail("active-queue", { status: companyDashboardBefore.status, snippet: companyDashboardBeforeHtml.slice(0, 2500) });
    }

    phase("active-queue", { deliveryId, phase: activeItem.dispatch.phase, activeAttemptNumber: activeItem.dispatch.activeAttemptNumber });

    const firstExpireRes = await postTrpc(apiUrl, "deliveries.reprocessTimeouts", company.cookie, { nowIso: new Date(Date.now() + 130_000).toISOString() });
    if (!firstExpireRes.response.ok) fail("reprocess-first", { status: firstExpireRes.response.status, body: firstExpireRes.body });
    const firstExpire = trpcData(firstExpireRes.body) as { expiredAttempts: number; advancedAttempts: number; movedToWaiting: number };
    if (firstExpire.expiredAttempts !== 1 || firstExpire.advancedAttempts !== 1 || firstExpire.movedToWaiting !== 0) {
      fail("reprocess-first", { firstExpire });
    }

    const secondExpireRes = await postTrpc(apiUrl, "deliveries.reprocessTimeouts", company.cookie, { nowIso: new Date(Date.now() + 260_000).toISOString() });
    if (!secondExpireRes.response.ok) fail("reprocess-second", { status: secondExpireRes.response.status, body: secondExpireRes.body });
    const secondExpire = trpcData(secondExpireRes.body) as { expiredAttempts: number; advancedAttempts: number; movedToWaiting: number };
    if (secondExpire.expiredAttempts !== 1 || secondExpire.advancedAttempts !== 0 || secondExpire.movedToWaiting !== 1) {
      fail("reprocess-second", { secondExpire });
    }

    const waitingQueueRes = await getTrpc(apiUrl, "deliveries.waitingQueue", company.cookie);
    if (!waitingQueueRes.response.ok) fail("waiting-queue", { status: waitingQueueRes.response.status, body: waitingQueueRes.body });
    const waitingQueue = trpcData(waitingQueueRes.body) as Array<{ deliveryId: string; dispatch: { phase: string; waitingReason: string | null; activeAttemptId: string | null; attempts: Array<{ status: string; attemptNumber: number }> } | null }>;
    const waitingItem = waitingQueue.find((row) => row.deliveryId === deliveryId);
    if (!waitingItem || !waitingItem.dispatch || waitingItem.dispatch.phase !== "waiting" || waitingItem.dispatch.waitingReason !== "max_private_attempts_reached" || waitingItem.dispatch.activeAttemptId !== null) {
      fail("waiting-queue", { waitingQueue, expectedDeliveryId: deliveryId });
    }

    const companyDashboardAfter = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: company.cookie, origin } });
    const companyDashboardAfterHtml = await companyDashboardAfter.text();
    if (
      !companyDashboardAfter.ok ||
      !companyDashboardAfterHtml.includes('data-testid="dispatch-waiting-list"') ||
      !companyDashboardAfterHtml.includes(`dispatch-waiting-card-${deliveryId}`) ||
      !companyDashboardAfterHtml.includes('Máximo de tentativas privadas atingido')
    ) {
      fail("waiting-queue", { status: companyDashboardAfter.status, snippet: companyDashboardAfterHtml.slice(0, 3000) });
    }

    const [queueEntry] = await db.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, deliveryId)).limit(1);
    const attempts = await db.select().from(dispatchAttempts).where(eq(dispatchAttempts.deliveryId, deliveryId)).orderBy(asc(dispatchAttempts.attemptNumber));
    const events = await db.select().from(deliveryEvents).where(eq(deliveryEvents.deliveryId, deliveryId)).orderBy(asc(deliveryEvents.sequence));
    const [deliveryRow] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);

    if (
      !queueEntry ||
      queueEntry.phase !== "waiting" ||
      queueEntry.waitingReason !== "max_private_attempts_reached" ||
      !deliveryRow ||
      deliveryRow.status !== "queued" ||
      attempts.length !== 2 ||
      attempts.some((attempt) => attempt.status !== "expired") ||
      events.map((event) => event.status).join(",") !== "created,queued,offered,failed_attempt,offered,failed_attempt,queued"
    ) {
      fail("db-evidence", {
        queuePhase: queueEntry?.phase ?? null,
        waitingReason: queueEntry?.waitingReason ?? null,
        deliveryStatus: deliveryRow?.status ?? null,
        attempts: attempts.map((attempt) => ({ attemptNumber: attempt.attemptNumber, status: attempt.status })),
        eventStatuses: events.map((event) => event.status)
      });
    }

    phase("waiting-queue", {
      deliveryId,
      waitingReason: waitingItem.dispatch.waitingReason,
      attempts: waitingItem.dispatch.attempts.map((attempt) => `${attempt.attemptNumber}:${attempt.status}`)
    });

    phase("db-evidence", {
      queuePhase: queueEntry.phase,
      deliveryStatus: deliveryRow.status,
      eventCount: events.length,
      attemptCount: attempts.length
    });

    const retailerDashboard = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: retailer.cookie, origin } });
    const retailerDashboardHtml = await retailerDashboard.text();
    if (!retailerDashboard.ok || !retailerDashboardHtml.includes(`dispatch-${suffix}`)) {
      fail("retailer-visibility", { status: retailerDashboard.status, snippet: retailerDashboardHtml.slice(0, 1500) });
    }

    const repeatRes = await postTrpc(apiUrl, "deliveries.reprocessTimeouts", company.cookie, { nowIso: new Date(Date.now() + 500_000).toISOString() });
    if (!repeatRes.response.ok) fail("idempotence", { status: repeatRes.response.status, body: repeatRes.body });
    const repeat = trpcData(repeatRes.body) as { expiredAttempts: number; advancedAttempts: number; movedToWaiting: number; deliveryIds: string[] };
    if (repeat.expiredAttempts !== 0 || repeat.advancedAttempts !== 0 || repeat.movedToWaiting !== 0 || repeat.deliveryIds.length !== 0) {
      fail("idempotence", { repeat });
    }

    phase("idempotence", repeat);
  } finally {
    if (dashboardOwnedByVerifier) await closeDashboard();
    await app.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
