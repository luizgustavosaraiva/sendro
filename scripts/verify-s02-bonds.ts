import { and, eq } from "drizzle-orm";
import { assertDb, bonds, companies, drivers, users } from "@repo/db";
import { buildApp } from "../apps/api/src/index";

type CookieJar = { cookie: string };

type TrpcEnvelope = {
  result?: { data?: { json?: unknown } | unknown };
  error?: { json?: { message?: string } | null; message?: string | null } | null;
};

const origin = "http://localhost:3000";

const trpcData = (body: TrpcEnvelope) => body.result?.data && typeof body.result.data === "object" && "json" in (body.result.data as object)
  ? (body.result.data as { json?: unknown }).json
  : body.result?.data;

const trpcErrorMessage = (body: TrpcEnvelope) => body.error?.json?.message ?? body.error?.message ?? "unknown_trpc_error";

const phase = (name: string, details: Record<string, unknown>) => {
  console.log(JSON.stringify({ phase: name, ...details }));
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

const getTrpc = async (baseUrl: string, path: string, cookie: string, input?: unknown) => {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await fetch(`${baseUrl}/trpc/${path}${query}`, {
    headers: {
      cookie,
      origin
    }
  });
  const body = await response.json() as TrpcEnvelope;
  return { response, body };
};

const postTrpc = async (baseUrl: string, path: string, cookie: string, input: unknown) => {
  const response = await fetch(`${baseUrl}/trpc/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      origin
    },
    body: JSON.stringify(input)
  });
  const body = await response.json() as TrpcEnvelope;
  return { response, body };
};

const main = async () => {
  const app = await buildApp();
  await app.listen({ port: 3001, host: "127.0.0.1" });
  const baseUrl = "http://127.0.0.1:3001";

  try {
    const { db } = assertDb();
    const suffix = Date.now();

    const company = await register(baseUrl, {
      name: "Verifier Company",
      email: `verifier-company.${suffix}@sendro.test`,
      password: "secret123",
      role: "company",
      companyName: "Verifier Company"
    });

    const retailer = await register(baseUrl, {
      name: "Verifier Retailer",
      email: `verifier-retailer.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "Verifier Retailer"
    });

    const retailerWithoutBond = await register(baseUrl, {
      name: "Verifier Retailer No Bond",
      email: `verifier-retailer-nobond.${suffix}@sendro.test`,
      password: "secret123",
      role: "retailer",
      retailerName: "Verifier Retailer No Bond"
    });

    const driver = await register(baseUrl, {
      name: "Verifier Driver",
      email: `verifier-driver.${suffix}@sendro.test`,
      password: "secret123",
      role: "driver",
      driverName: "Verifier Driver",
      phone: `+5511${String(suffix).slice(-8)}`
    });

    const companyMe = await getTrpc(baseUrl, "user.me", company.cookie);
    const retailerMe = await getTrpc(baseUrl, "user.me", retailer.cookie);
    const driverMe = await getTrpc(baseUrl, "user.me", driver.cookie);

    if (!companyMe.response.ok || !retailerMe.response.ok || !driverMe.response.ok) {
      throw new Error("profile_resolution_failed");
    }

    const companyProfile = trpcData(companyMe.body) as { profile: { id: string } };
    const retailerProfile = trpcData(retailerMe.body) as { profile: { id: string } };
    const driverProfile = trpcData(driverMe.body) as { profile: { id: string } };

    phase("bootstrap", {
      companyId: companyProfile.profile.id,
      retailerId: retailerProfile.profile.id,
      driverId: driverProfile.profile.id
    });

    const initialList = await getTrpc(baseUrl, "bonds.listCompanyBonds", company.cookie);
    if (!initialList.response.ok) {
      throw new Error(`list_initial_failed:${initialList.response.status}:${JSON.stringify(initialList.body)}`);
    }
    phase("list-initial", { data: trpcData(initialList.body) });

    const requestBond = await postTrpc(baseUrl, "bonds.requestRetailerBond", retailer.cookie, { companyId: companyProfile.profile.id });
    if (!requestBond.response.ok) {
      throw new Error(`request_failed:${requestBond.response.status}:${JSON.stringify(requestBond.body)}`);
    }
    const requestedBond = trpcData(requestBond.body) as { id: string; status: string };
    phase("request", requestedBond);

    const [driverUser] = await db.select().from(users).where(eq(users.email, `verifier-driver.${suffix}@sendro.test`)).limit(1);
    const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyProfile.profile.id)).limit(1);
    const [driverRow] = await db.select().from(drivers).where(eq(drivers.id, driverProfile.profile.id)).limit(1);

    if (!driverUser || !companyRow || !driverRow) {
      throw new Error("driver_seed_resolution_failed");
    }

    await db.insert(bonds).values({
      companyId: companyRow.id,
      entityId: driverRow.id,
      entityType: "driver",
      status: "active",
      requestedByUserId: driverUser.id
    });
    phase("driver-seed", { driverId: driverRow.id, companyId: companyRow.id });

    const approveBond = await postTrpc(baseUrl, "bonds.decideRetailerBond", company.cookie, {
      bondId: requestedBond.id,
      action: "approve"
    });
    if (!approveBond.response.ok) {
      throw new Error(`approve_failed:${approveBond.response.status}:${JSON.stringify(approveBond.body)}`);
    }
    phase("approve", trpcData(approveBond.body) as Record<string, unknown>);

    const finalList = await getTrpc(baseUrl, "bonds.listCompanyBonds", company.cookie);
    if (!finalList.response.ok) {
      throw new Error(`list_final_failed:${finalList.response.status}:${JSON.stringify(finalList.body)}`);
    }
    const finalData = trpcData(finalList.body) as {
      pendingRetailers: unknown[];
      activeRetailers: Array<{ entityId: string }>;
      activeDrivers: Array<{ entityId: string }>;
    };
    if (finalData.pendingRetailers.length !== 0 || finalData.activeRetailers.length !== 1 || finalData.activeDrivers.length !== 1) {
      throw new Error(`list_contract_failed:${JSON.stringify(finalData)}`);
    }
    phase("list", finalData);

    const gatePositive = await getTrpc(baseUrl, "bonds.assertRetailerCompanyActiveBond", retailer.cookie, {
      companyId: companyProfile.profile.id
    });
    if (!gatePositive.response.ok) {
      throw new Error(`gate_positive_failed:${gatePositive.response.status}:${JSON.stringify(gatePositive.body)}`);
    }
    phase("gate-positive", trpcData(gatePositive.body) as Record<string, unknown>);

    const gateNegative = await getTrpc(baseUrl, "bonds.assertRetailerCompanyActiveBond", retailerWithoutBond.cookie, {
      companyId: companyProfile.profile.id
    });
    if (gateNegative.response.status !== 403 || trpcErrorMessage(gateNegative.body) !== "bond_active_required:retailer_company") {
      throw new Error(`gate_negative_failed:${gateNegative.response.status}:${trpcErrorMessage(gateNegative.body)}`);
    }
    phase("gate-negative", { status: gateNegative.response.status, message: trpcErrorMessage(gateNegative.body) });

    const duplicateRequest = await postTrpc(baseUrl, "bonds.requestRetailerBond", retailer.cookie, { companyId: companyProfile.profile.id });
    if (duplicateRequest.response.status !== 409 || trpcErrorMessage(duplicateRequest.body) !== "bond_request_duplicate:active") {
      throw new Error(`duplicate_active_failed:${duplicateRequest.response.status}:${trpcErrorMessage(duplicateRequest.body)}`);
    }
    phase("duplicate-active", { status: duplicateRequest.response.status, message: trpcErrorMessage(duplicateRequest.body) });

    const [approvedRetailerBond] = await db
      .select()
      .from(bonds)
      .where(and(eq(bonds.companyId, companyProfile.profile.id), eq(bonds.entityId, retailerProfile.profile.id)))
      .limit(1);
    if (!approvedRetailerBond) {
      throw new Error("approved_bond_missing");
    }

    const revokeBond = await postTrpc(baseUrl, "bonds.decideRetailerBond", company.cookie, {
      bondId: approvedRetailerBond.id,
      action: "revoke"
    });
    if (!revokeBond.response.ok) {
      throw new Error(`revoke_failed:${revokeBond.response.status}:${JSON.stringify(revokeBond.body)}`);
    }
    phase("revoke", trpcData(revokeBond.body) as Record<string, unknown>);

    const gateAfterRevoke = await getTrpc(baseUrl, "bonds.assertRetailerCompanyActiveBond", retailer.cookie, {
      companyId: companyProfile.profile.id
    });
    if (gateAfterRevoke.response.status !== 403 || trpcErrorMessage(gateAfterRevoke.body) !== "bond_active_required:retailer_company") {
      throw new Error(`gate_revoked_failed:${gateAfterRevoke.response.status}:${trpcErrorMessage(gateAfterRevoke.body)}`);
    }
    phase("gate-revoked", { status: gateAfterRevoke.response.status, message: trpcErrorMessage(gateAfterRevoke.body) });
  } finally {
    await app.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
