import { and, eq } from "drizzle-orm";
import { assertDb, bonds, drivers, invitations, users } from "@repo/db";
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

const registerApiUser = async (baseUrl: string, payload: Record<string, unknown>): Promise<CookieJar> => {
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

const getSetCookie = (response: Response) => {
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    fail("cookie-missing", { status: response.status, url: response.url });
  }
  return cookie;
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

    const company = await registerApiUser(apiUrl, {
      name: "Invitation Company",
      email: `invitation-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "Invitation Company"
    });

    const companyMe = await getTrpc(apiUrl, "user.me", company.cookie);
    if (!companyMe.response.ok) {
      fail("company-bootstrap", { status: companyMe.response.status, body: companyMe.body });
    }

    const companyProfile = trpcData(companyMe.body) as { profile: { id: string; slug: string; name: string } };
    phase("bootstrap", { companyId: companyProfile.profile.id, companySlug: companyProfile.profile.slug });

    const dashboardInitial = await fetch(`${dashboardUrl}/dashboard`, {
      headers: {
        cookie: company.cookie,
        origin
      }
    });
    const dashboardInitialHtml = await dashboardInitial.text();
    if (
      !dashboardInitial.ok ||
      !dashboardInitialHtml.includes('data-testid="invitations-state"') ||
      !dashboardInitialHtml.includes('>empty</code>') ||
      !dashboardInitialHtml.includes('data-testid="invitation-list-empty"')
    ) {
      fail("dashboard-initial", { status: dashboardInitial.status, snippet: dashboardInitialHtml.slice(0, 600) });
    }
    phase("dashboard-initial", {
      status: dashboardInitial.status,
      invitationsStateEmpty: dashboardInitialHtml.includes('>empty</code>')
    });

    const createInvitation = await fetch(`${dashboardUrl}/dashboard/invitations`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: company.cookie,
        origin
      },
      body: new URLSearchParams({ channel: "link", invitedContact: "driver@sendro.test" }).toString(),
      redirect: "manual"
    });
    const dashboardAfterCreateHtml = await createInvitation.text();
    if (
      !createInvitation.ok ||
      !dashboardAfterCreateHtml.includes('data-testid="generated-invitation"') ||
      !dashboardAfterCreateHtml.includes('data-testid="generated-invite-url"') ||
      !dashboardAfterCreateHtml.includes('data-testid="invitations-state"') ||
      !dashboardAfterCreateHtml.includes('>loaded</code>')
    ) {
      fail("dashboard-create", { status: createInvitation.status, snippet: dashboardAfterCreateHtml.slice(0, 700) });
    }

    const inviteUrlMatch = dashboardAfterCreateHtml.match(/data-testid="generated-invite-url">([^<]+)/);
    if (!inviteUrlMatch) {
      fail("dashboard-create-parse", { error: "generated_invite_url_missing" });
    }
    const inviteUrl = decodeHtml(inviteUrlMatch[1]);
    const token = inviteUrl.split("/").at(-1);
    if (!token) {
      fail("dashboard-create-parse", { error: "token_missing_from_url", inviteUrl });
    }
    phase("dashboard-create", { inviteUrl, token });

    const invitationList = await getTrpc(apiUrl, "invitations.listCompanyInvitations", company.cookie);
    if (!invitationList.response.ok) {
      fail("invitation-list", { status: invitationList.response.status, body: invitationList.body });
    }
    const listData = trpcData(invitationList.body) as Array<{ invitationId: string; token: string; status: string }>;
    if (listData.length !== 1 || listData[0]?.token !== token || listData[0]?.status !== "pending") {
      fail("invitation-list-contract", { listData, expectedToken: token });
    }
    phase("invitation-list", { count: listData.length, invitationId: listData[0]?.invitationId, status: listData[0]?.status });

    const publicLookup = await fetch(`${apiUrl}/api/invitations/${token}`, {
      headers: { origin }
    });
    const publicLookupBody = await publicLookup.json();
    if (!publicLookup.ok || publicLookupBody.status !== "pending" || publicLookupBody.companyId !== companyProfile.profile.id) {
      fail("public-lookup", { status: publicLookup.status, body: publicLookupBody });
    }
    phase("public-lookup", {
      companyId: publicLookupBody.companyId,
      companyName: publicLookupBody.companyName,
      status: publicLookupBody.status
    });

    const invitePage = await fetch(inviteUrl, {
      headers: { origin },
      redirect: "manual"
    });
    if (invitePage.status !== 302 || invitePage.headers.get("location") !== `/register?invite=${encodeURIComponent(token)}`) {
      fail("invite-route-anon", { status: invitePage.status, location: invitePage.headers.get("location") });
    }
    phase("invite-route-anon", { status: invitePage.status, location: invitePage.headers.get("location") });

    const registerPage = await fetch(`${dashboardUrl}/register?invite=${encodeURIComponent(token)}`, {
      headers: { origin }
    });
    const registerHtml = await registerPage.text();
    if (
      !registerPage.ok ||
      !registerHtml.includes('data-testid="invite-card"') ||
      !registerHtml.includes('name="inviteToken"') ||
      !registerHtml.includes('name="role" value="driver"') ||
      !registerHtml.includes('data-testid="invite-status"') ||
      !registerHtml.includes('>pending</code>')
    ) {
      fail("register-page", { status: registerPage.status, snippet: registerHtml.slice(0, 700) });
    }
    phase("register-page", {
      status: registerPage.status,
      inviteCard: registerHtml.includes('data-testid="invite-card"'),
      driverLocked: registerHtml.includes('name="role" value="driver"')
    });

    const driverEmail = `invited-driver.${suffix}@sendro.test`;
    const registerInvitedDriver = await fetch(`${dashboardUrl}/register`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin
      },
      body: new URLSearchParams({
        name: "Invited Driver",
        email: driverEmail,
        password: "secret123",
        role: "driver",
        driverName: "Invited Driver",
        phone: `+5531${String(suffix).slice(-8)}`,
        inviteToken: token
      }).toString(),
      redirect: "manual"
    });
    if (registerInvitedDriver.status !== 302 || !registerInvitedDriver.headers.get("location")?.startsWith("/dashboard?invitationRedeemed=")) {
      const body = await registerInvitedDriver.text();
      fail("register-invited-driver", {
        status: registerInvitedDriver.status,
        location: registerInvitedDriver.headers.get("location"),
        body: body.slice(0, 500)
      });
    }
    const driverCookie = getSetCookie(registerInvitedDriver);
    phase("register-invited-driver", {
      status: registerInvitedDriver.status,
      location: registerInvitedDriver.headers.get("location")
    });

    const driverMe = await getTrpc(apiUrl, "user.me", driverCookie);
    if (!driverMe.response.ok) {
      fail("driver-bootstrap", { status: driverMe.response.status, body: driverMe.body });
    }
    const driverProfile = trpcData(driverMe.body) as { user: { id: string; role: string }; profile: { id: string } };
    if (driverProfile.user.role !== "driver") {
      fail("driver-bootstrap-contract", { driverProfile });
    }
    phase("driver-bootstrap", { userId: driverProfile.user.id, driverId: driverProfile.profile.id });

    const [driverUserRow] = await db.select().from(users).where(eq(users.id, driverProfile.user.id)).limit(1);
    const [driverRow] = await db.select().from(drivers).where(eq(drivers.id, driverProfile.profile.id)).limit(1);
    const [invitationRow] = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
    if (!driverUserRow || !driverRow || !invitationRow) {
      fail("database-resolution", {
        driverUserFound: Boolean(driverUserRow),
        driverFound: Boolean(driverRow),
        invitationFound: Boolean(invitationRow)
      });
    }

    if (invitationRow.status !== "accepted" || !invitationRow.acceptedAt) {
      fail("invitation-accepted", { status: invitationRow.status, acceptedAt: invitationRow.acceptedAt });
    }
    phase("invitation-accepted", {
      invitationId: invitationRow.id,
      status: invitationRow.status,
      acceptedAt: String(invitationRow.acceptedAt)
    });

    const [driverBond] = await db
      .select()
      .from(bonds)
      .where(
        and(
          eq(bonds.companyId, companyProfile.profile.id),
          eq(bonds.entityId, driverProfile.profile.id),
          eq(bonds.entityType, "driver")
        )
      )
      .limit(1);
    if (!driverBond || driverBond.status !== "active") {
      fail("driver-bond", { bond: driverBond ?? null, companyId: companyProfile.profile.id, driverId: driverProfile.profile.id });
    }
    phase("driver-bond", { bondId: driverBond.id, status: driverBond.status });

    const dashboardFinal = await fetch(`${dashboardUrl}/dashboard`, {
      headers: {
        cookie: company.cookie,
        origin
      }
    });
    const dashboardFinalHtml = await dashboardFinal.text();
    if (
      !dashboardFinal.ok ||
      !dashboardFinalHtml.includes("Invited Driver") ||
      !dashboardFinalHtml.includes('data-testid="bonds-state"') ||
      !dashboardFinalHtml.includes('data-testid="invitations-state"') ||
      !dashboardFinalHtml.includes(`>${token}<`) ||
      !dashboardFinalHtml.includes("status: <code>accepted</code>") ||
      !dashboardFinalHtml.includes('>loaded</code>')
    ) {
      fail("dashboard-final", { status: dashboardFinal.status, snippet: dashboardFinalHtml.slice(0, 1200) });
    }
    phase("dashboard-final", {
      status: dashboardFinal.status,
      containsDriver: dashboardFinalHtml.includes("Invited Driver"),
      invitationAccepted: dashboardFinalHtml.includes("status: <code>accepted</code>")
    });

    const redeemAgain = await fetch(inviteUrl, {
      headers: {
        cookie: driverCookie,
        origin
      },
      redirect: "manual"
    });
    const redeemAgainHtml = await redeemAgain.text();
    if (!redeemAgainHtml.includes("invitation_token_already_accepted")) {
      fail("invite-route-repeat", { status: redeemAgain.status, snippet: redeemAgainHtml.slice(0, 500) });
    }
    phase("invite-route-repeat", {
      status: redeemAgain.status,
      alreadyAcceptedVisible: redeemAgainHtml.includes("invitation_token_already_accepted")
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
