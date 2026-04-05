import { asc, eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertDb,
  bonds,
  deliveryEvents,
  deliveries,
  dispatchAttempts,
  dispatchQueueEntries,
  driverStrikes,
  drivers,
  users
} from "@repo/db";
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

const withTimeout = async (label: string, endpoint: string, request: Promise<Response>, timeoutMs = 12000) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Response>((_, reject) => {
    timer = setTimeout(() => reject(new Error(JSON.stringify({ phase: label, ok: false, endpoint, timeoutMs, error: "timeout" }))), timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  const response = await withTimeout(`timeout:${path}`, endpoint, fetch(endpoint, { headers: { cookie, origin } }));
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

const postForm = async (baseUrl: string, path: string, cookie: string, form: URLSearchParams) => {
  const endpoint = `${baseUrl}${path}`;
  const response = await withTimeout(
    `timeout:${path}`,
    endpoint,
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin },
      body: form.toString(),
      redirect: "manual"
    })
  );
  return response;
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

const execFileAsync = promisify(execFile);

const applyLocalMigrations = async () => {
  await execFileAsync("C:/ProgramData/chocolatey/bin/pnpm", ["--filter", "@repo/db", "db:migrate"], {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true
  });
};

const main = async () => {
  await applyLocalMigrations();

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
      name: "S02 Driver Company",
      email: `s02-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "S02 Driver Company"
    });
    const retailer = await register(apiUrl, {
      name: "S02 Retailer",
      email: `s02-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "S02 Retailer"
    });
    const driverA = await register(apiUrl, {
      name: "S02 Driver A",
      email: `s02-driver-a.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "S02 Driver A",
      phone: `+5561${String(suffix).slice(-8)}`
    });
    const driverB = await register(apiUrl, {
      name: "S02 Driver B",
      email: `s02-driver-b.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "S02 Driver B",
      phone: `+5562${String(suffix).slice(-8)}`
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

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `s02-retailer.${suffix}@sendro.test`)).limit(1);
    const [driverAUser] = await db.select().from(users).where(eq(users.email, `s02-driver-a.${suffix}@sendro.test`)).limit(1);
    const [driverARow] = await db.select().from(drivers).where(eq(drivers.id, driverAProfile.profile.id)).limit(1);
    const [driverBRow] = await db.select().from(drivers).where(eq(drivers.id, driverBProfile.profile.id)).limit(1);

    if (!retailerUser || !driverAUser || !driverARow || !driverBRow) {
      fail("bootstrap", {
        retailerUser: Boolean(retailerUser),
        driverAUser: Boolean(driverAUser),
        driverARow: Boolean(driverARow),
        driverBRow: Boolean(driverBRow)
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

    phase("bootstrap", {
      companyId: companyProfile.profile.id,
      retailerId: retailerProfile.profile.id,
      driverAId: driverAProfile.profile.id,
      driverBId: driverBProfile.profile.id
    });

    const createResponse = await postForm(
      dashboardUrl,
      "/dashboard/deliveries",
      retailer.cookie,
      new URLSearchParams({
        companyId: companyProfile.profile.id,
        externalReference: `s02-accept-${suffix}`,
        pickupAddress: "Rua Aceite 100",
        dropoffAddress: "Rua Destino 200",
        notes: "rota aceita"
      })
    );
    const createHtml = await createResponse.text();
    const deliveryIdMatch = createHtml.match(/data-testid="retailer-delivery-feedback"[\s\S]*?deliveryId:\s*<code>([^<]+)<\/code>/);
    const acceptedDeliveryId = deliveryIdMatch?.[1] ?? null;
    if (!createResponse.ok || !acceptedDeliveryId) {
      const errorMatch = createHtml.match(/data-testid="retailer-deliveries-error">([^<]+)</);
      fail("create-accepted", {
        status: createResponse.status,
        error: errorMatch?.[1] ?? null,
        snippet: createHtml.slice(0, 2000)
      });
    }

    const driverDashboard = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: driverA.cookie, origin } });
    const driverDashboardHtml = await driverDashboard.text();
    if (
      !driverDashboard.ok ||
      !driverDashboardHtml.includes('data-testid="driver-offer-card-') ||
      !driverDashboardHtml.includes(acceptedDeliveryId) ||
      !driverDashboardHtml.includes('data-testid="driver-offer-form-inline"')
    ) {
      fail("driver-offer-visible", { status: driverDashboard.status, snippet: driverDashboardHtml.slice(0, 2500) });
    }

    const acceptResponse = await postForm(
      dashboardUrl,
      "/dashboard/driver-offer",
      driverA.cookie,
      new URLSearchParams({ deliveryId: acceptedDeliveryId, decision: "accept" })
    );
    const acceptHtml = await acceptResponse.text();
    if (
      !acceptResponse.ok ||
      !acceptHtml.includes('data-testid="driver-offer-feedback"') ||
      !acceptHtml.includes('data-testid="driver-offer-feedback-resolution">accepted')
    ) {
      fail("driver-accept", { status: acceptResponse.status, snippet: acceptHtml.slice(0, 2500) });
    }

    const acceptedDetailRes = await getTrpc(apiUrl, "deliveries.detail", company.cookie, { deliveryId: acceptedDeliveryId });
    if (!acceptedDetailRes.response.ok) {
      fail("driver-accept", { step: "detail", status: acceptedDetailRes.response.status, body: acceptedDetailRes.body });
    }
    const acceptedDetail = trpcData(acceptedDetailRes.body) as {
      status: string;
      driverId: string | null;
      dispatch: { phase: string; attempts: Array<{ offerStatus: string; resolvedByActorType: string | null }> } | null;
      timeline: Array<{ status: string; actorType: string; sequence: number }>;
    };
    if (
      acceptedDetail.status !== "accepted" ||
      acceptedDetail.driverId !== driverAProfile.profile.id ||
      acceptedDetail.dispatch?.phase !== "completed" ||
      acceptedDetail.dispatch?.attempts[0]?.offerStatus !== "accepted" ||
      acceptedDetail.dispatch?.attempts[0]?.resolvedByActorType !== "driver" ||
      acceptedDetail.timeline.map((event) => event.status).join(",") !== "created,queued,offered,accepted"
    ) {
      fail("driver-accept", { acceptedDetail });
    }

    const companyAfterAccept = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: company.cookie, origin } });
    const companyAfterAcceptHtml = await companyAfterAccept.text();
    if (!companyAfterAccept.ok || !companyAfterAcceptHtml.includes(acceptedDeliveryId) || !companyAfterAcceptHtml.includes("Aceita")) {
      fail("company-reflect-accept", { status: companyAfterAccept.status, snippet: companyAfterAcceptHtml.slice(0, 2500) });
    }

    const createRejectResponse = await postForm(
      dashboardUrl,
      "/dashboard/deliveries",
      retailer.cookie,
      new URLSearchParams({
        companyId: companyProfile.profile.id,
        externalReference: `s02-reject-${suffix}`,
        pickupAddress: "Rua Rejeite 300",
        dropoffAddress: "Rua Destino 400",
        notes: "rota recusada"
      })
    );
    const createRejectHtml = await createRejectResponse.text();
    const rejectIdMatch = createRejectHtml.match(/data-testid="retailer-delivery-feedback"[\s\S]*?deliveryId:\s*<code>([^<]+)<\/code>/);
    const rejectedDeliveryId = rejectIdMatch?.[1] ?? null;
    if (!createRejectResponse.ok || !rejectedDeliveryId) {
      const errorMatch = createRejectHtml.match(/data-testid="retailer-deliveries-error">([^<]+)</);
      fail("create-rejected", {
        status: createRejectResponse.status,
        error: errorMatch?.[1] ?? null,
        snippet: createRejectHtml.slice(0, 2000)
      });
    }

    const rejectResponse = await postForm(
      dashboardUrl,
      "/dashboard/driver-offer",
      driverA.cookie,
      new URLSearchParams({
        deliveryId: rejectedDeliveryId,
        decision: "reject",
        reason: "driver_declined_capacity"
      })
    );
    const rejectHtml = await rejectResponse.text();
    if (
      !rejectResponse.ok ||
      !rejectHtml.includes('data-testid="driver-offer-feedback"') ||
      !rejectHtml.includes('data-testid="driver-offer-feedback-resolution">rejected') ||
      !rejectHtml.includes('data-testid="driver-offer-feedback-strike">warning')
    ) {
      fail("driver-reject", { status: rejectResponse.status, snippet: rejectHtml.slice(0, 3000) });
    }

    const rejectedDetailRes = await getTrpc(apiUrl, "deliveries.detail", company.cookie, { deliveryId: rejectedDeliveryId });
    if (!rejectedDetailRes.response.ok) {
      fail("driver-reject", { step: "detail", status: rejectedDetailRes.response.status, body: rejectedDetailRes.body });
    }
    const rejectedDetail = trpcData(rejectedDetailRes.body) as {
      status: string;
      dispatch: {
        phase: string;
        waitingReason: string | null;
        strikes: Array<{ consequence: string; reason: string }>;
        attempts: Array<{ offerStatus: string; resolvedByActorType: string | null; resolutionReason: string | null }>;
      } | null;
      timeline: Array<{ status: string; actorType: string; sequence: number }>;
    };
    if (
      rejectedDetail.status !== "queued" ||
      rejectedDetail.dispatch?.phase !== "waiting" ||
      rejectedDetail.dispatch?.waitingReason !== "no_candidates_available" ||
      rejectedDetail.dispatch?.attempts[0]?.offerStatus !== "rejected" ||
      rejectedDetail.dispatch?.attempts[0]?.resolvedByActorType !== "driver" ||
      rejectedDetail.dispatch?.attempts[0]?.resolutionReason !== "driver_declined_capacity" ||
      rejectedDetail.dispatch?.strikes[0]?.consequence !== "warning" ||
      rejectedDetail.timeline.map((event) => event.status).join(",") !== "created,queued,offered,failed_attempt,queued"
    ) {
      fail("driver-reject", { rejectedDetail });
    }

    const strikeRows = await db
      .select()
      .from(driverStrikes)
      .where(eq(driverStrikes.deliveryId, rejectedDeliveryId))
      .orderBy(asc(driverStrikes.createdAt));
    if (strikeRows.length !== 1 || strikeRows[0].consequence !== "warning" || strikeRows[0].reason !== "driver_declined_capacity") {
      fail("db-strikes", { strikeRows });
    }

    const [acceptedQueueEntry] = await db.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, acceptedDeliveryId)).limit(1);
    const [rejectedQueueEntry] = await db.select().from(dispatchQueueEntries).where(eq(dispatchQueueEntries.deliveryId, rejectedDeliveryId)).limit(1);
    const acceptedAttempts = await db
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, acceptedDeliveryId))
      .orderBy(asc(dispatchAttempts.attemptNumber));
    const rejectedAttempts = await db
      .select()
      .from(dispatchAttempts)
      .where(eq(dispatchAttempts.deliveryId, rejectedDeliveryId))
      .orderBy(asc(dispatchAttempts.attemptNumber));
    const acceptedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, acceptedDeliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    const rejectedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, rejectedDeliveryId))
      .orderBy(asc(deliveryEvents.sequence));
    const [acceptedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, acceptedDeliveryId)).limit(1);
    const [rejectedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, rejectedDeliveryId)).limit(1);
    const [driverBond] = await db
      .select()
      .from(bonds)
      .where(eq(bonds.entityId, driverAProfile.profile.id))
      .limit(1);

    if (
      !acceptedQueueEntry ||
      acceptedQueueEntry.phase !== "completed" ||
      !rejectedQueueEntry ||
      rejectedQueueEntry.phase !== "waiting" ||
      rejectedQueueEntry.waitingReason !== "no_candidates_available" ||
      !acceptedDelivery ||
      acceptedDelivery.status !== "accepted" ||
      !rejectedDelivery ||
      rejectedDelivery.status !== "queued" ||
      acceptedAttempts[0]?.offerStatus !== "accepted" ||
      rejectedAttempts[0]?.offerStatus !== "rejected" ||
      acceptedEvents.map((event) => event.sequence).join(",") !== "1,2,3,4" ||
      rejectedEvents.map((event) => event.sequence).join(",") !== "1,2,3,4,5" ||
      acceptedEvents[3]?.actorType !== "driver" ||
      rejectedEvents[3]?.actorType !== "driver" ||
      !driverBond ||
      driverBond.status !== "active"
    ) {
      fail("db-evidence", {
        acceptedQueuePhase: acceptedQueueEntry?.phase ?? null,
        rejectedQueuePhase: rejectedQueueEntry?.phase ?? null,
        rejectedWaitingReason: rejectedQueueEntry?.waitingReason ?? null,
        acceptedStatus: acceptedDelivery?.status ?? null,
        rejectedStatus: rejectedDelivery?.status ?? null,
        acceptedAttempts: acceptedAttempts.map((attempt) => ({ offerStatus: attempt.offerStatus, actor: attempt.resolvedByActorType })),
        rejectedAttempts: rejectedAttempts.map((attempt) => ({ offerStatus: attempt.offerStatus, actor: attempt.resolvedByActorType, reason: attempt.resolutionReason })),
        acceptedEvents: acceptedEvents.map((event) => ({ sequence: event.sequence, status: event.status, actorType: event.actorType })),
        rejectedEvents: rejectedEvents.map((event) => ({ sequence: event.sequence, status: event.status, actorType: event.actorType })),
        bondStatus: driverBond?.status ?? null
      });
    }

    phase("driver-flow", {
      acceptedDeliveryId,
      rejectedDeliveryId,
      acceptedQueuePhase: acceptedQueueEntry.phase,
      rejectedQueuePhase: rejectedQueueEntry.phase,
      strikeCount: strikeRows.length
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
