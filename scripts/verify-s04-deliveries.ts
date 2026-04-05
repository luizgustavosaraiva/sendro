import { and, asc, eq } from "drizzle-orm";
import { assertDb, bonds, companies, deliveries, deliveryEvents, drivers, users } from "@repo/db";
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
    headers: {
      "content-type": "application/json",
      origin
    },
    body: JSON.stringify(payload),
    redirect: "manual"
  });

  await expectOk(response, `signup_failed:${String(payload.role)}`);
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error(`signup_cookie_missing:${String(payload.role)}`);
  }

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
    fail(label, {
      endpoint: response.url,
      status: response.status,
      error: "malformed_json"
    });
  }
};

const getTrpc = async (baseUrl: string, path: string, cookie: string, input?: unknown) => {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const endpoint = `${baseUrl}/trpc/${path}${query}`;
  const response = await withTimeout(
    `timeout:${path}`,
    endpoint,
    fetch(endpoint, {
      headers: {
        cookie,
        origin
      }
    })
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
      headers: {
        "content-type": "application/json",
        cookie,
        origin
      },
      body: JSON.stringify(input)
    })
  );
  const body = await readJson(`malformed:${path}`, response);
  return { response, body, endpoint };
};

const closeDashboard = async () =>
  new Promise<void>((resolve, reject) => {
    dashboardServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const canReuseDashboard = async () => {
  try {
    const response = await fetch("http://127.0.0.1:3000/login", {
      headers: { origin }
    });
    return response.ok;
  } catch {
    return false;
  }
};

const decodeHtml = (value: string) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");

const extractDeliveryId = (html: string) => {
  const match = html.match(/data-testid="retailer-delivery-feedback"[\s\S]*?deliveryId:\s*<code>([^<]+)<\/code>/);
  return match ? decodeHtml(match[1]) : null;
};

const extractStatuses = (html: string) => Array.from(html.matchAll(/data-testid="delivery-event-status">([^<]+)/g)).map((match) => decodeHtml(match[1]));

const extractSequences = (html: string) =>
  Array.from(html.matchAll(/data-testid="delivery-event-sequence">(\d+)</g)).map((match) => Number(match[1]));

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
      name: "Delivery Verifier Company",
      email: `delivery-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "Delivery Verifier Company"
    });

    const retailer = await register(apiUrl, {
      name: "Delivery Verifier Retailer",
      email: `delivery-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "Delivery Verifier Retailer"
    });

    const retailerWithoutBond = await register(apiUrl, {
      name: "Delivery Verifier Retailer No Bond",
      email: `delivery-retailer-nobond.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "Delivery Verifier Retailer No Bond"
    });

    const driver = await register(apiUrl, {
      name: "Delivery Verifier Driver",
      email: `delivery-driver.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "Delivery Verifier Driver",
      phone: `+5511${String(suffix).slice(-8)}`
    });

    const companyMe = await getTrpc(apiUrl, "user.me", company.cookie);
    const retailerMe = await getTrpc(apiUrl, "user.me", retailer.cookie);
    const driverMe = await getTrpc(apiUrl, "user.me", driver.cookie);

    if (!companyMe.response.ok || !retailerMe.response.ok || !driverMe.response.ok) {
      fail("bootstrap", {
        companyStatus: companyMe.response.status,
        retailerStatus: retailerMe.response.status,
        driverStatus: driverMe.response.status
      });
    }

    const companyProfile = trpcData(companyMe.body) as { user: { id: string }; profile: { id: string; name: string } };
    const retailerProfile = trpcData(retailerMe.body) as { user: { id: string }; profile: { id: string; name: string } };
    const driverProfile = trpcData(driverMe.body) as { user: { id: string }; profile: { id: string; name: string } };

    phase("bootstrap", {
      companyId: companyProfile.profile.id,
      retailerId: retailerProfile.profile.id,
      driverId: driverProfile.profile.id
    });

    const requestBond = await postTrpc(apiUrl, "bonds.requestRetailerBond", retailer.cookie, {
      companyId: companyProfile.profile.id
    });
    if (!requestBond.response.ok) {
      fail("bond", { status: requestBond.response.status, body: requestBond.body });
    }
    const requestedBond = trpcData(requestBond.body) as { id: string; status: string };

    const [driverUser] = await db.select().from(users).where(eq(users.email, `delivery-driver.${suffix}@sendro.test`)).limit(1);
    const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyProfile.profile.id)).limit(1);
    const [driverRow] = await db.select().from(drivers).where(eq(drivers.id, driverProfile.profile.id)).limit(1);

    if (!driverUser || !companyRow || !driverRow) {
      fail("bond", {
        driverUserFound: Boolean(driverUser),
        companyFound: Boolean(companyRow),
        driverFound: Boolean(driverRow)
      });
    }

    await db.insert(bonds).values({
      companyId: companyRow.id,
      entityId: driverRow.id,
      entityType: "driver",
      status: "active",
      requestedByUserId: driverUser.id
    });

    const approveBond = await postTrpc(apiUrl, "bonds.decideRetailerBond", company.cookie, {
      bondId: requestedBond.id,
      action: "approve"
    });
    if (!approveBond.response.ok) {
      fail("bond", { status: approveBond.response.status, body: approveBond.body, step: "approve" });
    }

    phase("bond", {
      retailerBondId: requestedBond.id,
      retailerBondStatus: (trpcData(approveBond.body) as { status: string }).status,
      driverSeeded: true
    });

    const createDelivery = await fetch(`${dashboardUrl}/dashboard/deliveries`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: retailer.cookie,
        origin
      },
      body: new URLSearchParams({
        companyId: companyProfile.profile.id,
        externalReference: `pedido-${suffix}`,
        pickupAddress: "Rua Coleta 123",
        dropoffAddress: "Rua Entrega 456",
        notes: "fragil"
      }).toString(),
      redirect: "manual"
    });
    const createHtml = await createDelivery.text();
    const createdDeliveryId = extractDeliveryId(createHtml);
    if (
      !createDelivery.ok ||
      !createHtml.includes('data-testid="retailer-delivery-feedback"') ||
      !createHtml.includes('Entrega criada com sucesso') ||
      !createHtml.includes('data-testid="retailer-deliveries-state"') ||
      !createHtml.includes('>loaded</code>') ||
      !createHtml.includes(`pedido-${suffix}`) ||
      !createdDeliveryId
    ) {
      fail("create", { status: createDelivery.status, snippet: createHtml.slice(0, 1600) });
    }

    const createdDetail = await getTrpc(apiUrl, "deliveries.detail", retailer.cookie, { deliveryId: createdDeliveryId });
    if (!createdDetail.response.ok) {
      fail("create", { status: createdDetail.response.status, body: createdDetail.body, step: "detail" });
    }
    const createdPayload = trpcData(createdDetail.body) as {
      deliveryId: string;
      status: string;
      timeline: Array<{ status: string; sequence: number; actorType: string; actorId: string | null; createdAt: string }>;
    };
    if (
      createdPayload.deliveryId !== createdDeliveryId ||
      createdPayload.status !== "created" ||
      createdPayload.timeline.length !== 1 ||
      createdPayload.timeline[0]?.status !== "created" ||
      createdPayload.timeline[0]?.sequence !== 1 ||
      createdPayload.timeline[0]?.actorType !== "retailer" ||
      !createdPayload.timeline[0]?.createdAt
    ) {
      fail("create", { createdPayload });
    }

    phase("create", {
      deliveryId: createdDeliveryId,
      status: createdPayload.status,
      initialTimelineLength: createdPayload.timeline.length
    });

    const companyQueue = await getTrpc(apiUrl, "deliveries.list", company.cookie);
    if (!companyQueue.response.ok) {
      fail("queue", { status: companyQueue.response.status, body: companyQueue.body });
    }
    const companyRows = trpcData(companyQueue.body) as Array<{
      deliveryId: string;
      companyId: string;
      retailerId: string;
      status: string;
      timeline: Array<{ sequence: number; status: string }>;
    }>;
    const companyDelivery = companyRows.find((row) => row.deliveryId === createdDeliveryId);
    if (
      !companyDelivery ||
      companyDelivery.companyId !== companyProfile.profile.id ||
      companyDelivery.retailerId !== retailerProfile.profile.id ||
      companyDelivery.status !== "created" ||
      companyDelivery.timeline[0]?.sequence !== 1
    ) {
      fail("queue", { companyRows, expectedDeliveryId: createdDeliveryId });
    }

    phase("queue", {
      companyVisible: Boolean(companyDelivery),
      companyQueueCount: companyRows.length,
      companyScoped: companyRows.every((row) => row.companyId === companyProfile.profile.id)
    });

    const assignDelivery = await fetch(`${dashboardUrl}/dashboard/deliveries/transition`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: company.cookie,
        origin
      },
      body: new URLSearchParams({
        deliveryId: createdDeliveryId,
        status: "assigned",
        notes: "empresa confirmou atribuicao"
      }).toString(),
      redirect: "manual"
    });
    const assignHtml = await assignDelivery.text();
    if (
      !assignDelivery.ok ||
      !assignHtml.includes('data-testid="company-delivery-feedback"') ||
      !assignHtml.includes('status: <code>assigned</code>')
    ) {
      fail("transition", { step: "assigned", status: assignDelivery.status, snippet: assignHtml.slice(0, 1500) });
    }

    const pickUpTransition = await postTrpc(apiUrl, "deliveries.transition", company.cookie, {
      deliveryId: createdDeliveryId,
      status: "picked_up",
      metadata: { notes: "motorista coletou" }
    });
    if (!pickUpTransition.response.ok) {
      fail("transition", { step: "picked_up", status: pickUpTransition.response.status, body: pickUpTransition.body });
    }

    const inTransitTransition = await postTrpc(apiUrl, "deliveries.transition", company.cookie, {
      deliveryId: createdDeliveryId,
      status: "in_transit",
      metadata: { notes: "rota iniciada" }
    });
    if (!inTransitTransition.response.ok) {
      fail("transition", { step: "in_transit", status: inTransitTransition.response.status, body: inTransitTransition.body });
    }

    const inTransitPayload = trpcData(inTransitTransition.body) as {
      deliveryId: string;
      status: string;
      timeline: Array<{ status: string; sequence: number; actorType: string; actorId: string | null; createdAt: string }>;
    };
    const statuses = inTransitPayload.timeline.map((event) => event.status);
    const sequences = inTransitPayload.timeline.map((event) => event.sequence);
    if (
      inTransitPayload.status !== "in_transit" ||
      statuses.join(",") !== "created,assigned,picked_up,in_transit" ||
      sequences.join(",") !== "1,2,3,4" ||
      inTransitPayload.timeline.slice(1).some((event) => event.actorType !== "company" || !event.actorId || !event.createdAt)
    ) {
      fail("transition", { inTransitPayload });
    }

    const [deliveryRow] = await db.select().from(deliveries).where(eq(deliveries.id, createdDeliveryId)).limit(1);
    const eventRows = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, createdDeliveryId))
      .orderBy(asc(deliveryEvents.sequence), asc(deliveryEvents.createdAt));
    if (
      !deliveryRow ||
      deliveryRow.status !== "in_transit" ||
      eventRows.length !== 4 ||
      eventRows.map((event) => event.status).join(",") !== "created,assigned,picked_up,in_transit" ||
      eventRows.map((event) => event.sequence).join(",") !== "1,2,3,4"
    ) {
      fail("transition", {
        deliveryStatus: deliveryRow?.status ?? null,
        eventStatuses: eventRows.map((event) => event.status),
        eventSequences: eventRows.map((event) => event.sequence)
      });
    }

    phase("transition", {
      deliveryId: createdDeliveryId,
      status: deliveryRow.status,
      eventCount: eventRows.length
    });

    const timelineDetail = await getTrpc(apiUrl, "deliveries.detail", company.cookie, { deliveryId: createdDeliveryId });
    if (!timelineDetail.response.ok) {
      fail("timeline", { status: timelineDetail.response.status, body: timelineDetail.body });
    }
    const timelinePayload = trpcData(timelineDetail.body) as {
      timeline: Array<{ sequence: number; status: string; actorType: string; actorId: string | null; createdAt: string }>;
    };
    const ordered = timelinePayload.timeline.every((event, index, arr) => index === 0 || arr[index - 1]!.sequence < event.sequence);
    const immutableActors = timelinePayload.timeline.every((event) => (event.actorType === "retailer" || event.actorType === "company") && Boolean(event.createdAt));
    if (!ordered || !immutableActors) {
      fail("timeline", { timeline: timelinePayload.timeline });
    }

    phase("timeline", {
      orderedBySequence: ordered,
      actorTimestampsPresent: immutableActors,
      lastStatus: timelinePayload.timeline.at(-1)?.status ?? null
    });

    const dashboardCompany = await fetch(`${dashboardUrl}/dashboard`, {
      headers: {
        cookie: company.cookie,
        origin
      }
    });
    const dashboardCompanyHtml = await dashboardCompany.text();
    const companyTimelineStatuses = extractStatuses(dashboardCompanyHtml);
    const companyTimelineSequences = extractSequences(dashboardCompanyHtml);
    if (
      !dashboardCompany.ok ||
      !dashboardCompanyHtml.includes('data-testid="company-deliveries-state"') ||
      !dashboardCompanyHtml.includes('>loaded</code>') ||
      !dashboardCompanyHtml.includes(`pedido-${suffix}`) ||
      !dashboardCompanyHtml.includes('Em trânsito') ||
      !dashboardCompanyHtml.includes('Delivery Verifier Company') ||
      !dashboardCompanyHtml.includes('Delivery Verifier Retailer') ||
      companyTimelineStatuses.join(",") !== "Criada,Atribuída,Coletada,Em trânsito" ||
      companyTimelineSequences.join(",") !== "1,2,3,4"
    ) {
      fail("dashboard", { status: dashboardCompany.status, snippet: dashboardCompanyHtml.slice(0, 2500), companyTimelineStatuses, companyTimelineSequences });
    }

    const dashboardRetailer = await fetch(`${dashboardUrl}/dashboard`, {
      headers: {
        cookie: retailer.cookie,
        origin
      }
    });
    const dashboardRetailerHtml = await dashboardRetailer.text();
    if (
      !dashboardRetailer.ok ||
      !dashboardRetailerHtml.includes('data-testid="retailer-deliveries-state"') ||
      !dashboardRetailerHtml.includes('>loaded</code>') ||
      !dashboardRetailerHtml.includes(`pedido-${suffix}`) ||
      !dashboardRetailerHtml.includes('Em trânsito')
    ) {
      fail("dashboard", { step: "retailer", status: dashboardRetailer.status, snippet: dashboardRetailerHtml.slice(0, 2000) });
    }

    phase("dashboard", {
      companyDashboardStatus: dashboardCompany.status,
      retailerDashboardStatus: dashboardRetailer.status,
      timelineRendered: true
    });

    const negativeCreate = await fetch(`${dashboardUrl}/dashboard/deliveries`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: retailerWithoutBond.cookie,
        origin
      },
      body: new URLSearchParams({
        companyId: companyProfile.profile.id,
        externalReference: `pedido-negativo-${suffix}`,
        pickupAddress: "Rua Sem Vínculo 1",
        dropoffAddress: "Rua Sem Vínculo 2",
        notes: "nao deve criar"
      }).toString(),
      redirect: "manual"
    });
    const negativeHtml = await negativeCreate.text();

    const negativeApi = await postTrpc(apiUrl, "deliveries.create", retailerWithoutBond.cookie, {
      companyId: companyProfile.profile.id,
      externalReference: `pedido-negativo-api-${suffix}`,
      pickupAddress: "Rua Sem Vínculo API 1",
      dropoffAddress: "Rua Sem Vínculo API 2"
    });
    if (negativeApi.response.status !== 403 || trpcErrorMessage(negativeApi.body) !== "bond_active_required:retailer_company") {
      fail("gate-negative", { apiStatus: negativeApi.response.status, apiMessage: trpcErrorMessage(negativeApi.body) });
    }

    if (
      !negativeCreate.ok ||
      negativeHtml.includes(`pedido-negativo-${suffix}`) ||
      !negativeHtml.includes('data-testid="retailer-deliveries-state"')
    ) {
      fail("gate-negative", { status: negativeCreate.status, snippet: negativeHtml.slice(0, 2400) });
    }

    const duplicateRows = await db
      .select()
      .from(deliveries)
      .where(and(eq(deliveries.companyId, companyProfile.profile.id), eq(deliveries.externalReference, `pedido-negativo-${suffix}`)));
    if (duplicateRows.length !== 0) {
      fail("gate-negative", { duplicateRows });
    }

    phase("gate-negative", {
      dashboardErrorVisible: true,
      apiStatus: negativeApi.response.status,
      apiMessage: trpcErrorMessage(negativeApi.body)
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
