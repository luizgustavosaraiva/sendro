import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertDb,
  bonds,
  deliveries,
  deliveryEvents,
  dispatchAttempts,
  dispatchQueueEntries,
  driverStrikes,
  users
} from "@repo/db";
import { buildApp } from "../apps/api/src/index";
import { renderDashboardPage } from "../apps/dashboard/src/app/(app)/dashboard/page";
import { server as dashboardServer, startDashboard } from "../apps/dashboard/src/server";

type CookieJar = { cookie: string };
type TrpcEnvelope = {
  result?: { data?: { json?: unknown } | unknown };
  error?: { json?: { message?: string } | null; message?: string | null } | null;
};

const origin = "http://localhost:3000";
const execFileAsync = promisify(execFile);

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

const trpcData = (body: TrpcEnvelope) =>
  body.result?.data && typeof body.result.data === "object" && "json" in (body.result.data as object)
    ? (body.result.data as { json?: unknown }).json
    : body.result?.data;

const withTimeout = async (label: string, endpoint: string, request: Promise<Response>, timeoutMs = 12000) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Response>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(JSON.stringify({ phase: label, ok: false, endpoint, timeoutMs, error: "timeout" }))),
      timeoutMs
    );
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

const getTrpc = async (baseUrl: string, path: string, cookie: string, input?: unknown) => {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const endpoint = `${baseUrl}/trpc/${path}${query}`;
  const response = await withTimeout(`timeout:${path}`, endpoint, fetch(endpoint, { headers: { cookie, origin } }));
  const body = await readJson(`malformed:${path}`, response);
  return { response, body, endpoint };
};

const postForm = async (baseUrl: string, path: string, cookie: string, form: URLSearchParams) => {
  const endpoint = `${baseUrl}${path}`;
  return withTimeout(
    `timeout:${path}`,
    endpoint,
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin },
      body: form.toString(),
      redirect: "manual"
    })
  );
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

const canReuseApi = async () => {
  try {
    const response = await fetch("http://127.0.0.1:3001/trpc/user.me", { headers: { origin } });
    return response.status < 500;
  } catch {
    return false;
  }
};

const applyLocalMigrations = async () => {
  await execFileAsync("C:/ProgramData/chocolatey/bin/pnpm", ["tsx", "scripts/repair-local-drizzle-state.ts"], {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true
  });

  await execFileAsync("C:/ProgramData/chocolatey/bin/pnpm", ["--filter", "@repo/db", "db:migrate"], {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true
  });
};

const assertContains = (html: string, needle: string, phaseName: string, status: number) => {
  if (!html.includes(needle)) {
    fail(phaseName, { status, missing: needle, snippet: html.slice(0, 3000) });
  }
};

const extractDeliveryId = (html: string) => {
  const match = html.match(/data-testid="retailer-delivery-feedback"[\s\S]*?deliveryId:\s*<code>([^<]+)<\/code>/);
  return match?.[1] ?? null;
};

const extractNumberAfterTestId = (html: string, testId: string) => {
  const pattern = new RegExp(`data-testid="${testId}"[\\s\\S]*?<strong>(\\d+)<\\/strong>`);
  const match = html.match(pattern);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
};

const main = async () => {
  await applyLocalMigrations();

  const apiOwnedByVerifier = !(await canReuseApi());
  const dashboardOwnedByVerifier = !(await canReuseDashboard());

  const apiApp = apiOwnedByVerifier ? await buildApp() : null;
  if (apiApp) {
    await apiApp.listen({ port: 3001, host: "127.0.0.1" });
  }

  if (dashboardOwnedByVerifier) {
    await startDashboard();
  }

  const apiUrl = "http://127.0.0.1:3001";
  const dashboardUrl = "http://127.0.0.1:3000";

  try {
    const { db } = assertDb();
    const suffix = Date.now();

    const company = await register(apiUrl, {
      name: "S04 Ops Company",
      email: `s04-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "S04 Ops Company"
    });
    const retailer = await register(apiUrl, {
      name: "S04 Ops Retailer",
      email: `s04-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "S04 Ops Retailer"
    });
    const driverA = await register(apiUrl, {
      name: "S04 Ops Driver A",
      email: `s04-driver-a.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "S04 Ops Driver A",
      phone: `+5571${String(suffix).slice(-8)}`
    });
    const driverB = await register(apiUrl, {
      name: "S04 Ops Driver B",
      email: `s04-driver-b.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "S04 Ops Driver B",
      phone: `+5572${String(suffix).slice(-8)}`
    });

    const outsiderCompany = await register(apiUrl, {
      name: "S04 Outsider Company",
      email: `s04-outsider-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "S04 Outsider Company"
    });
    const outsiderRetailer = await register(apiUrl, {
      name: "S04 Outsider Retailer",
      email: `s04-outsider-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "S04 Outsider Retailer"
    });

    const companyMe = await getTrpc(apiUrl, "user.me", company.cookie);
    const retailerMe = await getTrpc(apiUrl, "user.me", retailer.cookie);
    const driverAMe = await getTrpc(apiUrl, "user.me", driverA.cookie);
    const driverBMe = await getTrpc(apiUrl, "user.me", driverB.cookie);
    const outsiderCompanyMe = await getTrpc(apiUrl, "user.me", outsiderCompany.cookie);
    const outsiderRetailerMe = await getTrpc(apiUrl, "user.me", outsiderRetailer.cookie);

    if (
      !companyMe.response.ok ||
      !retailerMe.response.ok ||
      !driverAMe.response.ok ||
      !driverBMe.response.ok ||
      !outsiderCompanyMe.response.ok ||
      !outsiderRetailerMe.response.ok
    ) {
      fail("bootstrap", {
        companyStatus: companyMe.response.status,
        retailerStatus: retailerMe.response.status,
        driverAStatus: driverAMe.response.status,
        driverBStatus: driverBMe.response.status,
        outsiderCompanyStatus: outsiderCompanyMe.response.status,
        outsiderRetailerStatus: outsiderRetailerMe.response.status
      });
    }

    const companyProfile = trpcData(companyMe.body) as { profile: { id: string } };
    const retailerProfile = trpcData(retailerMe.body) as { profile: { id: string } };
    const driverAProfile = trpcData(driverAMe.body) as { profile: { id: string } };
    const driverBProfile = trpcData(driverBMe.body) as { profile: { id: string } };
    const outsiderCompanyProfile = trpcData(outsiderCompanyMe.body) as { profile: { id: string } };
    const outsiderRetailerProfile = trpcData(outsiderRetailerMe.body) as { profile: { id: string } };

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `s04-retailer.${suffix}@sendro.test`)).limit(1);
    const [outsiderRetailerUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, `s04-outsider-retailer.${suffix}@sendro.test`))
      .limit(1);

    if (!retailerUser || !outsiderRetailerUser) {
      fail("bootstrap", { retailerUser: Boolean(retailerUser), outsiderRetailerUser: Boolean(outsiderRetailerUser) });
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
        entityId: driverAProfile.profile.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser.id
      },
      {
        companyId: companyProfile.profile.id,
        entityId: driverBProfile.profile.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser.id
      },
      {
        companyId: outsiderCompanyProfile.profile.id,
        entityId: outsiderRetailerProfile.profile.id,
        entityType: "retailer",
        status: "active",
        requestedByUserId: outsiderRetailerUser.id
      }
    ]);

    phase("bootstrap", {
      companyId: companyProfile.profile.id,
      retailerId: retailerProfile.profile.id,
      driverAId: driverAProfile.profile.id,
      driverBId: driverBProfile.profile.id,
      outsiderCompanyId: outsiderCompanyProfile.profile.id,
      apiOwnedByVerifier,
      dashboardOwnedByVerifier
    });

    const createDelivery = async (externalReference: string) => {
      const response = await postForm(
        dashboardUrl,
        "/dashboard/deliveries",
        retailer.cookie,
        new URLSearchParams({
          companyId: companyProfile.profile.id,
          externalReference,
          pickupAddress: "Rua Operacao 10",
          dropoffAddress: "Rua Operacao 20",
          notes: "fixture s04"
        })
      );
      const html = await response.text();
      const deliveryId = extractDeliveryId(html);
      if (!response.ok || !deliveryId) {
        fail("bootstrap", { step: "create_delivery", status: response.status, externalReference, snippet: html.slice(0, 2000) });
      }
      return deliveryId;
    };

    const deliveryBusy = await createDelivery(`s04-busy-${suffix}`);

    const detailBusy = await getTrpc(apiUrl, "deliveries.detail", company.cookie, { deliveryId: deliveryBusy });
    if (!detailBusy.response.ok) {
      fail("bootstrap", { step: "resolve_busy_offered_driver", deliveryId: deliveryBusy, status: detailBusy.response.status, body: detailBusy.body });
    }
    const busyPayload = trpcData(detailBusy.body) as { dispatch: { offeredDriverId: string | null } | null };
    const busyOfferedDriverId = busyPayload.dispatch?.offeredDriverId;
    const busyOfferedDriverCookie = busyOfferedDriverId
      ? busyOfferedDriverId === driverAProfile.profile.id
        ? driverA.cookie
        : busyOfferedDriverId === driverBProfile.profile.id
          ? driverB.cookie
          : null
      : null;

    if (!busyOfferedDriverId || !busyOfferedDriverCookie) {
      fail("bootstrap", { step: "resolve_busy_offered_driver", deliveryId: deliveryBusy, busyOfferedDriverId });
    }

    const acceptBusy = await postForm(
      dashboardUrl,
      "/dashboard/driver-offer",
      busyOfferedDriverCookie,
      new URLSearchParams({ deliveryId: deliveryBusy, decision: "accept" })
    );
    const acceptBusyHtml = await acceptBusy.text();
    assertContains(acceptBusyHtml, 'data-testid="driver-offer-feedback-resolution">accepted', "bootstrap", acceptBusy.status);

    const transitionBusyPickup = await postForm(
      dashboardUrl,
      "/dashboard/deliveries/transition",
      company.cookie,
      new URLSearchParams({ deliveryId: deliveryBusy, status: "picked_up", notes: "coleta" })
    );
    assertContains(await transitionBusyPickup.text(), 'data-testid="company-delivery-feedback"', "bootstrap", transitionBusyPickup.status);

    const transitionBusyTransit = await postForm(
      dashboardUrl,
      "/dashboard/deliveries/transition",
      company.cookie,
      new URLSearchParams({ deliveryId: deliveryBusy, status: "in_transit", notes: "rota" })
    );
    assertContains(await transitionBusyTransit.text(), 'data-testid="company-delivery-feedback"', "bootstrap", transitionBusyTransit.status);

    const driverCookieById = new Map<string, string>([
      [driverAProfile.profile.id, driverA.cookie],
      [driverBProfile.profile.id, driverB.cookie]
    ]);

    const rejectActiveOffer = async (deliveryId: string, expectConsequence?: string) => {
      const detail = await getTrpc(apiUrl, "deliveries.detail", company.cookie, { deliveryId });
      if (!detail.response.ok) {
        fail("bootstrap", { step: "resolve_offered_driver", deliveryId, status: detail.response.status, body: detail.body });
      }
      const payload = trpcData(detail.body) as {
        dispatch: { offeredDriverId: string | null } | null;
      };

      const offeredDriverId = payload.dispatch?.offeredDriverId;
      const offeredCookie = offeredDriverId ? driverCookieById.get(offeredDriverId) : undefined;
      if (!offeredDriverId || !offeredCookie) {
        fail("bootstrap", { step: "resolve_offered_driver", deliveryId, offeredDriverId });
      }

      const rejectResponse = await postForm(
        dashboardUrl,
        "/dashboard/driver-offer",
        offeredCookie,
        new URLSearchParams({ deliveryId, decision: "reject", reason: "driver_declined_capacity" })
      );
      const rejectHtml = await rejectResponse.text();
      assertContains(rejectHtml, 'data-testid="driver-offer-feedback-resolution">rejected', "bootstrap", rejectResponse.status);
      if (expectConsequence) {
        assertContains(rejectHtml, `data-testid="driver-offer-feedback-strike">${expectConsequence}`, "bootstrap", rejectResponse.status);
      }
      return { offeredDriverId };
    };

    const deliveryWaitingA = await createDelivery(`s04-waiting-a-${suffix}`);
    const firstReject = await rejectActiveOffer(deliveryWaitingA);

    const deliveryWaitingB = await createDelivery(`s04-waiting-b-${suffix}`);
    const secondReject = await rejectActiveOffer(deliveryWaitingB, "bond_suspended");

    if (firstReject.offeredDriverId !== secondReject.offeredDriverId) {
      fail("bootstrap", {
        step: "strike_progression_single_driver",
        firstRejectDriverId: firstReject.offeredDriverId,
        secondRejectDriverId: secondReject.offeredDriverId
      });
    }

    const outsiderCreate = await postForm(
      dashboardUrl,
      "/dashboard/deliveries",
      outsiderRetailer.cookie,
      new URLSearchParams({
        companyId: outsiderCompanyProfile.profile.id,
        externalReference: `s04-outsider-${suffix}`,
        pickupAddress: "Rua X",
        dropoffAddress: "Rua Y"
      })
    );
    assertContains(await outsiderCreate.text(), 'data-testid="retailer-delivery-feedback"', "bootstrap", outsiderCreate.status);

    const companyDashboard = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: company.cookie, origin } });
    const companyHtml = await companyDashboard.text();

    if (!companyDashboard.ok) {
      fail("summary-kpis", { status: companyDashboard.status, snippet: companyHtml.slice(0, 3000) });
    }

    assertContains(companyHtml, 'data-testid="operations-summary-kpis"', "summary-kpis", companyDashboard.status);
    assertContains(companyHtml, 'data-testid="drivers-operational-list"', "summary-kpis", companyDashboard.status);
    assertContains(companyHtml, 'data-testid="kpi-on-time-state">unavailable_policy_pending', "summary-kpis", companyDashboard.status);
    assertContains(companyHtml, 'data-testid="kpi-on-time-value">n/a', "summary-kpis", companyDashboard.status);

    const awaitingAcceptanceHtml = extractNumberAfterTestId(companyHtml, "kpi-awaiting-acceptance");
    const waitingQueueHtml = extractNumberAfterTestId(companyHtml, "kpi-waiting-queue");
    const failedAttemptsHtml = extractNumberAfterTestId(companyHtml, "kpi-failed-attempts");
    const deliveredHtml = extractNumberAfterTestId(companyHtml, "kpi-delivered");
    const activeDriversHtml = extractNumberAfterTestId(companyHtml, "kpi-active-drivers");

    if (
      awaitingAcceptanceHtml === null ||
      waitingQueueHtml === null ||
      failedAttemptsHtml === null ||
      deliveredHtml === null ||
      activeDriversHtml === null
    ) {
      fail("summary-kpis", {
        awaitingAcceptanceHtml,
        waitingQueueHtml,
        failedAttemptsHtml,
        deliveredHtml,
        activeDriversHtml,
        snippet: companyHtml.slice(0, 4000)
      });
    }

    const summaryTrpc = await getTrpc(apiUrl, "deliveries.operationsSummary", company.cookie, { window: "all_time" });
    if (!summaryTrpc.response.ok) {
      fail("summary-kpis", { status: summaryTrpc.response.status, body: summaryTrpc.body });
    }

    const summaryPayload = trpcData(summaryTrpc.body) as {
      kpis: {
        awaitingAcceptance: number;
        waitingQueue: number;
        failedAttempts: number;
        delivered: number;
        activeDrivers: number;
      };
      onTime: { state: string; reason: string };
    };

    if (
      summaryPayload.onTime.state !== "unavailable_policy_pending" ||
      summaryPayload.kpis.awaitingAcceptance !== awaitingAcceptanceHtml ||
      summaryPayload.kpis.waitingQueue !== waitingQueueHtml ||
      summaryPayload.kpis.failedAttempts !== failedAttemptsHtml ||
      summaryPayload.kpis.delivered !== deliveredHtml ||
      summaryPayload.kpis.activeDrivers !== activeDriversHtml
    ) {
      fail("summary-kpis", {
        summaryPayload,
        html: {
          awaitingAcceptanceHtml,
          waitingQueueHtml,
          failedAttemptsHtml,
          deliveredHtml,
          activeDriversHtml
        }
      });
    }

    phase("summary-kpis", {
      ...summaryPayload.kpis,
      onTimeState: summaryPayload.onTime.state
    });

    const driversTrpc = await getTrpc(apiUrl, "deliveries.companyDriversOperational", company.cookie);
    if (!driversTrpc.response.ok) {
      fail("drivers-operational", { status: driversTrpc.response.status, body: driversTrpc.body });
    }

    const driversPayload = trpcData(driversTrpc.body) as Array<{
      driverId: string;
      bondStatus: string;
      operationalState: string;
      strikeCount: number;
      strikeConsequence: string | null;
      activeDeliveriesCount: number;
      pendingOfferCount: number;
      failedAttemptsCount: number;
    }>;

    const suspendedDriver = driversPayload.find((row) => row.driverId === secondReject.offeredDriverId);
    const activeDriver = driversPayload.find((row) => row.bondStatus === "active");
    const hasOperationalActivity = driversPayload.some((row) => row.activeDeliveriesCount > 0 || row.pendingOfferCount > 0);

    if (
      !suspendedDriver ||
      suspendedDriver.bondStatus !== "suspended" ||
      suspendedDriver.operationalState !== "suspended" ||
      suspendedDriver.strikeCount < 2 ||
      suspendedDriver.strikeConsequence !== "bond_suspended" ||
      !activeDriver ||
      !hasOperationalActivity
    ) {
      fail("drivers-operational", { driversPayload, suspendedDriverId: secondReject.offeredDriverId });
    }

    assertContains(companyHtml, 'data-testid="driver-operational-bond-status">Ativo', "drivers-operational", companyDashboard.status);
    assertContains(companyHtml, 'data-testid="driver-operational-bond-status">Suspenso', "drivers-operational", companyDashboard.status);

    phase("drivers-operational", {
      totalDrivers: driversPayload.length,
      suspendedDriver: suspendedDriver.driverId,
      suspendedStrikeCount: suspendedDriver.strikeCount,
      activeDriver: activeDriver.driverId
    });

    const dbSummary = await db
      .select({
        awaitingAcceptance: sql<number>`count(*) filter (where ${dispatchQueueEntries.phase} = 'offered')::int`,
        waitingQueue: sql<number>`count(*) filter (where ${dispatchQueueEntries.phase} = 'waiting')::int`
      })
      .from(dispatchQueueEntries)
      .where(eq(dispatchQueueEntries.companyId, companyProfile.profile.id));

    const dbFailedAttempts = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(dispatchAttempts)
      .where(
        and(
          eq(dispatchAttempts.companyId, companyProfile.profile.id),
          inArray(dispatchAttempts.offerStatus, ["rejected", "expired"])
        )
      );

    const dbDelivered = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deliveries)
      .where(and(eq(deliveries.companyId, companyProfile.profile.id), eq(deliveries.status, "delivered")));

    const dbActiveDrivers = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bonds)
      .where(
        and(eq(bonds.companyId, companyProfile.profile.id), eq(bonds.entityType, "driver"), eq(bonds.status, "active"))
      );

    const strikeRows = await db
      .select()
      .from(driverStrikes)
      .where(and(eq(driverStrikes.companyId, companyProfile.profile.id), eq(driverStrikes.driverId, secondReject.offeredDriverId)))
      .orderBy(asc(driverStrikes.createdAt));

    const deliveryOneEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, deliveryBusy))
      .orderBy(asc(deliveryEvents.sequence));

    if (
      (dbSummary[0]?.awaitingAcceptance ?? 0) !== summaryPayload.kpis.awaitingAcceptance ||
      (dbSummary[0]?.waitingQueue ?? 0) !== summaryPayload.kpis.waitingQueue ||
      (dbFailedAttempts[0]?.count ?? 0) !== summaryPayload.kpis.failedAttempts ||
      (dbDelivered[0]?.count ?? 0) !== summaryPayload.kpis.delivered ||
      (dbActiveDrivers[0]?.count ?? 0) !== summaryPayload.kpis.activeDrivers ||
      strikeRows.length < 2 ||
      strikeRows.at(-1)?.consequence !== "bond_suspended" ||
      deliveryOneEvents.map((event) => event.status).join(",") !== "created,queued,offered,accepted,picked_up,in_transit"
    ) {
      fail("db-evidence", {
        dbSummary: dbSummary[0],
        dbFailedAttempts: dbFailedAttempts[0],
        dbDelivered: dbDelivered[0],
        dbActiveDrivers: dbActiveDrivers[0],
        summaryKpis: summaryPayload.kpis,
        strikeRows: strikeRows.map((row) => ({ consequence: row.consequence, reason: row.reason })),
        deliveryOneEvents: deliveryOneEvents.map((event) => ({ sequence: event.sequence, status: event.status, actorType: event.actorType }))
      });
    }

    phase("db-evidence", {
      waitingQueue: dbSummary[0]?.waitingQueue ?? 0,
      failedAttempts: dbFailedAttempts[0]?.count ?? 0,
      activeDrivers: dbActiveDrivers[0]?.count ?? 0,
      strikeCount: strikeRows.length,
      deliveredOneTimeline: deliveryOneEvents.length
    });

    const outsiderSummaryTrpc = await getTrpc(apiUrl, "deliveries.operationsSummary", outsiderCompany.cookie, { window: "all_time" });
    const outsiderSummary = trpcData(outsiderSummaryTrpc.body) as {
      kpis: { waitingQueue: number; failedAttempts: number };
      onTime: { state: string };
    };

    if (!outsiderSummaryTrpc.response.ok || outsiderSummary.kpis.failedAttempts !== 0 || outsiderSummary.onTime.state !== "unavailable_policy_pending") {
      fail("company-scope", { status: outsiderSummaryTrpc.response.status, outsiderSummary });
    }

    const globalWaiting = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(dispatchQueueEntries)
      .where(eq(dispatchQueueEntries.phase, "waiting"));

    if ((globalWaiting[0]?.count ?? 0) <= (dbSummary[0]?.waitingQueue ?? 0)) {
      fail("company-scope", {
        globalWaiting: globalWaiting[0]?.count ?? 0,
        companyWaiting: dbSummary[0]?.waitingQueue ?? 0
      });
    }

    phase("company-scope", {
      companyWaitingQueue: dbSummary[0]?.waitingQueue ?? 0,
      outsiderWaitingQueue: outsiderSummary.kpis.waitingQueue,
      globalWaitingQueue: globalWaiting[0]?.count ?? 0,
      onTimeState: outsiderSummary.onTime.state
    });

    const emptyCompany = await register(apiUrl, {
      name: "S04 Empty Company",
      email: `s04-empty-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "S04 Empty Company"
    });

    const emptySummaryTrpc = await getTrpc(apiUrl, "deliveries.operationsSummary", emptyCompany.cookie, { window: "all_time" });
    const emptySummary = trpcData(emptySummaryTrpc.body) as {
      kpis: { awaitingAcceptance: number; waitingQueue: number; failedAttempts: number; delivered: number; activeDrivers: number };
      onTime: { state: string };
    };

    if (
      !emptySummaryTrpc.response.ok ||
      emptySummary.kpis.awaitingAcceptance !== 0 ||
      emptySummary.kpis.waitingQueue !== 0 ||
      emptySummary.kpis.failedAttempts !== 0 ||
      emptySummary.kpis.delivered !== 0 ||
      emptySummary.kpis.activeDrivers !== 0 ||
      emptySummary.onTime.state !== "unavailable_policy_pending"
    ) {
      fail("summary-kpis", { step: "zero-boundary", status: emptySummaryTrpc.response.status, emptySummary });
    }

    const simulatedErrorHtml = renderDashboardPage({
      user: { name: "S04 Simulated Company", email: "simulated@sendro.test", role: "company" },
      profile: { name: "S04 Simulated Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      bondsState: "empty",
      invitations: { invitations: [], state: "empty" },
      summary: null,
      summaryState: "error",
      summaryError: "summary block failed",
      driversOperational: [],
      driversState: "error",
      driversError: "drivers block failed",
      retailerDeliveries: { state: "not-retailer", error: "Somente lojistas podem criar entregas pelo dashboard.", deliveries: [] },
      companyDeliveries: {
        state: "loaded",
        deliveries: [],
        activeQueue: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655441000",
            companyId: "550e8400-e29b-41d4-a716-446655441001",
            retailerId: "550e8400-e29b-41d4-a716-446655441002",
            driverId: null,
            externalReference: "queue-still-visible",
            status: "offered",
            pickupAddress: null,
            dropoffAddress: null,
            metadata: {},
            proof: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            timeline: [],
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655441003",
              deliveryId: "550e8400-e29b-41d4-a716-446655441000",
              companyId: "550e8400-e29b-41d4-a716-446655441001",
              phase: "offered",
              timeoutSeconds: 120,
              activeAttemptNumber: 1,
              activeAttemptId: "550e8400-e29b-41d4-a716-446655441004",
              offeredDriverId: null,
              offeredDriverName: null,
              offeredAt: null,
              deadlineAt: null,
              waitingReason: null,
              waitingSince: null,
              rankingVersion: "dispatch-v1",
              assumptions: [],
              latestSnapshot: [],
              strikes: [],
              attempts: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          }
        ],
        waitingQueue: []
      },
      driverDeliveries: {
        state: "not-driver",
        offerState: "not-driver",
        strikeState: "not-driver",
        error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard.",
        deliveries: [],
        activeOffer: null,
        strikeSummary: { total: 0, lastStrike: null, activeConsequence: null, bondStatus: null }
      }
    });

    if (
      !simulatedErrorHtml.includes('data-testid="operations-summary-error"') ||
      !simulatedErrorHtml.includes('data-testid="drivers-operational-error"') ||
      !simulatedErrorHtml.includes('data-testid="dispatch-active-list"') ||
      !simulatedErrorHtml.includes("queue-still-visible")
    ) {
      fail("drivers-operational", { step: "simulated-error-path", snippet: simulatedErrorHtml.slice(0, 3000) });
    }
  } finally {
    if (dashboardOwnedByVerifier) {
      await closeDashboard();
    }
    if (apiApp) {
      await apiApp.close();
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
