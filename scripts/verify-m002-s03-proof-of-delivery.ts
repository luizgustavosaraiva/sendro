import { asc, eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertDb,
  bonds,
  companies,
  deliveryEvents,
  deliveries,
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
const execFileAsync = promisify(execFile);

const phase = (name: string, details: Record<string, unknown>) => {
  console.log(JSON.stringify({ phase: name, ...details }));
};

const fail = (name: string, details: Record<string, unknown>): never => {
  throw new Error(JSON.stringify({ phase: name, ok: false, ...details }));
};

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

const trpcData = (body: TrpcEnvelope) =>
  body.result?.data && typeof body.result.data === "object" && "json" in (body.result.data as object)
    ? (body.result.data as { json?: unknown }).json
    : body.result?.data;

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
      name: "S03 Proof Company",
      email: `s03-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "S03 Proof Company"
    });
    const retailer = await register(apiUrl, {
      name: "S03 Retailer",
      email: `s03-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "S03 Retailer"
    });
    const driver = await register(apiUrl, {
      name: "S03 Driver",
      email: `s03-driver.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "S03 Driver",
      phone: `+5591${String(suffix).slice(-8)}`
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

    const companyProfile = trpcData(companyMe.body) as { profile: { id: string } };
    const retailerProfile = trpcData(retailerMe.body) as { profile: { id: string } };
    const driverProfile = trpcData(driverMe.body) as { profile: { id: string } };

    const [retailerUser] = await db.select().from(users).where(eq(users.email, `s03-retailer.${suffix}@sendro.test`)).limit(1);
    if (!retailerUser) {
      fail("bootstrap", { retailerUser: false });
    }

    await db
      .update(companies)
      .set({ proofRequiredNote: true, proofRequiredPhoto: true, updatedAt: new Date() })
      .where(eq(companies.id, companyProfile.profile.id));

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
        entityId: driverProfile.profile.id,
        entityType: "driver",
        status: "active",
        requestedByUserId: retailerUser.id
      }
    ]);

    phase("bootstrap", {
      companyId: companyProfile.profile.id,
      retailerId: retailerProfile.profile.id,
      driverId: driverProfile.profile.id,
      apiOwnedByVerifier,
      dashboardOwnedByVerifier
    });

    const createResponse = await postForm(
      dashboardUrl,
      "/dashboard/deliveries",
      retailer.cookie,
      new URLSearchParams({
        companyId: companyProfile.profile.id,
        externalReference: `s03-proof-${suffix}`,
        pickupAddress: "Rua Prova 100",
        dropoffAddress: "Rua Prova 200",
        notes: "entrega com política de prova"
      })
    );
    const createHtml = await createResponse.text();
    const deliveryIdMatch = createHtml.match(/data-testid="retailer-delivery-feedback"[\s\S]*?deliveryId:\s*<code>([^<]+)<\/code>/);
    const deliveryId = deliveryIdMatch?.[1] ?? null;
    if (!createResponse.ok || !deliveryId) {
      fail("create-delivery", { status: createResponse.status, snippet: createHtml.slice(0, 3000) });
    }

    const acceptResponse = await postForm(
      dashboardUrl,
      "/dashboard/driver-offer",
      driver.cookie,
      new URLSearchParams({ deliveryId, decision: "accept" })
    );
    const acceptHtml = await acceptResponse.text();
    assertContains(acceptHtml, 'data-testid="driver-offer-feedback-resolution">accepted', "accept-offer", acceptResponse.status);

    const toPickedUp = await postForm(
      dashboardUrl,
      "/dashboard/deliveries/transition",
      company.cookie,
      new URLSearchParams({ deliveryId, status: "picked_up", notes: "pacote coletado" })
    );
    const pickedUpHtml = await toPickedUp.text();
    assertContains(pickedUpHtml, 'data-testid="company-delivery-feedback"', "transition-picked-up", toPickedUp.status);

    const toTransit = await postForm(
      dashboardUrl,
      "/dashboard/deliveries/transition",
      company.cookie,
      new URLSearchParams({ deliveryId, status: "in_transit", notes: "rota iniciada" })
    );
    const transitHtml = await toTransit.text();
    assertContains(transitHtml, 'data-testid="company-delivery-feedback"', "transition-in-transit", toTransit.status);

    const missingPhoto = await postForm(
      dashboardUrl,
      "/dashboard/deliveries/complete",
      driver.cookie,
      new URLSearchParams({ deliveryId, proofNote: "Recebido na portaria" })
    );
    const missingPhotoHtml = await missingPhoto.text();
    assertContains(missingPhotoHtml, 'data-testid="driver-deliveries-error"', "missing-photo", missingPhoto.status);
    assertContains(missingPhotoHtml, "delivery_proof_photo_required", "missing-photo", missingPhoto.status);

    const missingNote = await postForm(
      dashboardUrl,
      "/dashboard/deliveries/complete",
      driver.cookie,
      new URLSearchParams({ deliveryId, proofPhotoUrl: "https://cdn.sendro.test/proofs/s03-no-note.jpg" })
    );
    const missingNoteHtml = await missingNote.text();
    assertContains(missingNoteHtml, 'data-testid="driver-deliveries-error"', "missing-note", missingNote.status);
    assertContains(missingNoteHtml, "delivery_proof_note_required", "missing-note", missingNote.status);

    const [deliveryBeforeProof] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
    const eventsBeforeProof = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, deliveryId))
      .orderBy(asc(deliveryEvents.sequence));

    if (
      !deliveryBeforeProof ||
      deliveryBeforeProof.status !== "in_transit" ||
      eventsBeforeProof.map((event) => event.status).join(",") !== "created,queued,offered,accepted,picked_up,in_transit"
    ) {
      fail("before-proof-state", {
        status: deliveryBeforeProof?.status ?? null,
        events: eventsBeforeProof.map((event) => ({ sequence: event.sequence, status: event.status, actorType: event.actorType }))
      });
    }

    const completeResponse = await postForm(
      dashboardUrl,
      "/dashboard/deliveries/complete",
      driver.cookie,
      new URLSearchParams({
        deliveryId,
        proofNote: "Recebido pelo cliente final.",
        proofPhotoUrl: "https://cdn.sendro.test/proofs/s03-proof.jpg"
      })
    );
    const completeHtml = await completeResponse.text();
    assertContains(completeHtml, 'data-testid="delivery-proof"', "complete-proof", completeResponse.status);
    assertContains(completeHtml, 'data-testid="delivery-proof-policy">note=true photo=true', "complete-proof", completeResponse.status);
    assertContains(completeHtml, "Recebido pelo cliente final.", "complete-proof", completeResponse.status);

    const companyDashboard = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: company.cookie, origin } });
    const companyDashboardHtml = await companyDashboard.text();
    assertContains(companyDashboardHtml, 'data-testid="delivery-proof"', "company-ssr", companyDashboard.status);
    assertContains(companyDashboardHtml, "Entregue", "company-ssr", companyDashboard.status);
    assertContains(companyDashboardHtml, "https://cdn.sendro.test/proofs/s03-proof.jpg", "company-ssr", companyDashboard.status);

    const retailerDashboard = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: retailer.cookie, origin } });
    const retailerDashboardHtml = await retailerDashboard.text();
    assertContains(retailerDashboardHtml, 'data-testid="delivery-proof"', "retailer-ssr", retailerDashboard.status);
    assertContains(retailerDashboardHtml, "Recebido pelo cliente final.", "retailer-ssr", retailerDashboard.status);

    const driverDashboard = await fetch(`${dashboardUrl}/dashboard`, { headers: { cookie: driver.cookie, origin } });
    const driverDashboardHtml = await driverDashboard.text();
    assertContains(driverDashboardHtml, 'data-testid="delivery-proof"', "driver-ssr", driverDashboard.status);
    assertContains(driverDashboardHtml, "https://cdn.sendro.test/proofs/s03-proof.jpg", "driver-ssr", driverDashboard.status);

    const [storedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1);
    const storedEvents = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.deliveryId, deliveryId))
      .orderBy(asc(deliveryEvents.sequence));

    if (
      !storedDelivery ||
      storedDelivery.status !== "delivered" ||
      !storedDelivery.deliveredAt ||
      storedDelivery.proofNote !== "Recebido pelo cliente final." ||
      storedDelivery.proofPhotoUrl !== "https://cdn.sendro.test/proofs/s03-proof.jpg" ||
      storedDelivery.proofRequiredNote !== true ||
      storedDelivery.proofRequiredPhoto !== true ||
      storedDelivery.proofSubmittedByActorType !== "driver"
    ) {
      fail("db-delivery", {
        status: storedDelivery?.status ?? null,
        deliveredAt: storedDelivery?.deliveredAt ?? null,
        proofNote: storedDelivery?.proofNote ?? null,
        proofPhotoUrl: storedDelivery?.proofPhotoUrl ?? null,
        proofRequiredNote: storedDelivery?.proofRequiredNote ?? null,
        proofRequiredPhoto: storedDelivery?.proofRequiredPhoto ?? null,
        proofSubmittedByActorType: storedDelivery?.proofSubmittedByActorType ?? null
      });
    }

    const sequences = storedEvents.map((event) => event.sequence);
    const statuses = storedEvents.map((event) => event.status);
    const tail = storedEvents.slice(-2);

    if (
      sequences.join(",") !== "1,2,3,4,5,6,7" ||
      statuses.join(",") !== "created,queued,offered,accepted,picked_up,in_transit,delivered" ||
      tail[0]?.status !== "in_transit" ||
      tail[1]?.status !== "delivered" ||
      tail[1]?.actorType !== "driver"
    ) {
      fail("db-events", {
        sequences,
        statuses,
        tail: tail.map((event) => ({ sequence: event.sequence, status: event.status, actorType: event.actorType, metadata: event.metadata }))
      });
    }

    phase("proof-of-delivery", {
      deliveryId,
      status: storedDelivery.status,
      deliveredSequence: tail[1]?.sequence ?? null,
      totalEvents: storedEvents.length
    });
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
