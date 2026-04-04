import { buildApp } from "../apps/api/src/index";

const scenarios = [
  { role: "company", extra: { companyName: "ACME Company" }, expectStripe: true },
  { role: "retailer", extra: { retailerName: "ACME Retailer" }, expectStripe: true },
  { role: "driver", extra: { driverName: "ACME Driver", phone: "+5511988887777" }, expectStripe: false }
] as const;

const main = async () => {
  const app = await buildApp();
  await app.listen({ port: 3001, host: "127.0.0.1" });

  try {
    for (const scenario of scenarios) {
      const suffix = `${scenario.role}-${Date.now()}`;
      const payload = {
        name: `${scenario.role} verifier`,
        email: `${scenario.role}.${suffix}@sendro.test`,
        password: "secret123",
        role: scenario.role,
        ...scenario.extra
      };

      const cookieJar: string[] = [];
      const signupResponse = await fetch("http://127.0.0.1:3001/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000"
        },
        body: JSON.stringify(payload),
        redirect: "manual"
      });
      const signupCookie = signupResponse.headers.get("set-cookie");
      if (signupCookie) cookieJar.push(signupCookie);
      if (!signupResponse.ok) {
        throw new Error(`signup_failed:${scenario.role}:${signupResponse.status}:${await signupResponse.text()}`);
      }

      const cookieHeader = cookieJar.join("; ");
      const sessionResponse = await fetch("http://127.0.0.1:3001/api/auth/get-session", {
        headers: cookieHeader ? { cookie: cookieHeader } : undefined
      });
      if (!sessionResponse.ok) {
        throw new Error(`session_failed:${scenario.role}:${sessionResponse.status}:${await sessionResponse.text()}`);
      }
      const session = await sessionResponse.json();

      const trpcResponse = await fetch("http://127.0.0.1:3001/trpc/user.me", {
        headers: {
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          origin: "http://localhost:3000"
        }
      });
      if (!trpcResponse.ok) {
        throw new Error(`trpc_failed:${scenario.role}:${trpcResponse.status}:${await trpcResponse.text()}`);
      }
      const trpcBody = await trpcResponse.json();
      const data = trpcBody.result?.data?.json ?? trpcBody.result?.data ?? trpcBody;

      if (session.user.role !== scenario.role) {
        throw new Error(`role_mismatch:${scenario.role}:${session.user.role}`);
      }
      if (Boolean(data.profile?.stripeCustomerId) !== scenario.expectStripe) {
        throw new Error(`stripe_mismatch:${scenario.role}:${String(data.profile?.stripeCustomerId)}`);
      }

      console.log(JSON.stringify({ stage: "verified", role: scenario.role, email: payload.email, diagnostics: data.diagnostics }));
    }
  } finally {
    await app.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
