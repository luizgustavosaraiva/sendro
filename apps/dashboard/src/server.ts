import { createServer } from "node:http";
import { parse as parseQuery } from "node:querystring";
import LoginPage from "./app/(auth)/login/page";
import RegisterPage from "./app/(auth)/register/page";
import { renderDashboardPage } from "./app/(app)/dashboard/page";
import { authClient } from "./lib/auth-client";
import { getSessionFromRequest } from "./lib/auth";
import { type CreateDeliveryInput, type ResolveDriverOfferInput, type TransitionDeliveryInput } from "@repo/shared";
import {
  getCurrentUser,
  getDashboardCompanyViewModel,
  lookupInvitationByToken,
  redeemInvitationByToken
} from "./lib/trpc";
import { env } from "./lib/env";

const parseBody = async (request: import("node:http").IncomingMessage) => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return parseQuery(body) as Record<string, string>;
};

const forwardCookies = (upstream: Response, response: import("node:http").ServerResponse) => {
  const raw = upstream.headers.get("set-cookie");
  if (raw) {
    response.setHeader("set-cookie", raw);
  }
};

const redirect = (response: import("node:http").ServerResponse, location: string) => {
  response.statusCode = 302;
  response.setHeader("location", location);
  response.end();
};

const sendHtml = (response: import("node:http").ServerResponse, html: string, statusCode = 200) => {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
};

const sendText = (response: import("node:http").ServerResponse, message: string, statusCode = 500) => {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(message);
};

const requestToFetchRequest = (request: import("node:http").IncomingMessage) => {
  const origin = env.appUrl;
  const url = new URL(request.url ?? "/", origin);
  const headers = new Headers();
  Object.entries(request.headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      headers.set(key, value.join("; "));
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  });
  return new Request(url.toString(), { headers, method: request.method });
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const registerPageOptionsForToken = async (token: string) => {
  try {
    const invitation = await lookupInvitationByToken(token);

    if (invitation.status !== "pending") {
      return {
        inviteToken: token,
        inviteStatus: invitation.status,
        inviteCompanyName: invitation.companyName,
        inviteCompanySlug: invitation.companySlug,
        inviteError: `Este convite não está mais disponível para aceite automático. Diagnóstico: invitation_status_${invitation.status}`
      };
    }

    return {
      inviteToken: token,
      inviteStatus: invitation.status,
      inviteCompanyName: invitation.companyName,
      inviteCompanySlug: invitation.companySlug
    };
  } catch (error) {
    return {
      inviteToken: token,
      inviteStatus: "pending" as const,
      inviteError: error instanceof Error ? error.message : "invitation_lookup_failed"
    };
  }
};

const rerenderDashboard = async (
  response: import("node:http").ServerResponse,
  cookieHeader: string | null | undefined,
  options?: Parameters<typeof getDashboardCompanyViewModel>[1]
) => {
  const viewModel = await getDashboardCompanyViewModel(cookieHeader ?? null, options);

  if (!viewModel?.user) {
    sendHtml(
      response,
      `<!DOCTYPE html><html><body><main><h1>Dashboard indisponível</h1><p role="alert">SSR session resolved but dashboard data failed before rendering.</p></main></body></html>`,
      502
    );
    return;
  }

  sendHtml(response, renderDashboardPage(viewModel));
};

const normalizeMaybeNull = (value: string | undefined) => {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendText(response, "Missing request URL", 400);
      return;
    }

    const url = new URL(request.url, env.appUrl);

    if (request.method === "GET" && url.pathname === "/") {
      redirect(response, "/login");
      return;
    }

    if (request.method === "GET" && url.pathname === "/login") {
      sendHtml(response, LoginPage());
      return;
    }

    if (request.method === "POST" && url.pathname === "/login") {
      const form = await parseBody(request);
      try {
        const upstream = await authClient.login({
          email: String(form.email ?? ""),
          password: String(form.password ?? "")
        });
        forwardCookies(upstream, response);
        redirect(response, "/dashboard");
      } catch (error) {
        sendHtml(
          response,
          `<!DOCTYPE html><html><body><main><h1>Login Sendro</h1><p role="alert">${error instanceof Error ? error.message : "login_failed"}</p></main></body></html>`,
          400
        );
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/register") {
      const token = url.searchParams.get("invite") ?? undefined;
      const options = token ? await registerPageOptionsForToken(token) : undefined;
      sendHtml(response, RegisterPage(options));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/invite/")) {
      const token = decodeURIComponent(url.pathname.replace(/^\/invite\//, "")).trim();
      if (!token) {
        redirect(response, "/register");
        return;
      }

      const session = await getSessionFromRequest(requestToFetchRequest(request));
      if (session?.user) {
        const currentUser = await getCurrentUser(request.headers.cookie ?? null);
        if (!currentUser?.user) {
          redirect(response, `/register?invite=${encodeURIComponent(token)}`);
          return;
        }

        if (currentUser.user.role !== "driver") {
          sendHtml(
            response,
            RegisterPage({
              ...(await registerPageOptionsForToken(token)),
              inviteStatus: "invalid-role",
              inviteError: "Este convite exige uma conta de entregador. Faça logout e conclua o cadastro como entregador."
            }),
            409
          );
          return;
        }

        try {
          const redeemed = await redeemInvitationByToken(token, request.headers.cookie ?? null);
          if (!redeemed) {
            throw new Error("invitation_redeem_unauthorized");
          }
          redirect(response, `/dashboard?invitationRedeemed=${encodeURIComponent(redeemed.invitationId)}`);
        } catch (error) {
          sendHtml(
            response,
            RegisterPage({
              ...(await registerPageOptionsForToken(token)),
              inviteError: error instanceof Error ? error.message : "invitation_redeem_failed"
            }),
            409
          );
        }
        return;
      }

      redirect(response, `/register?invite=${encodeURIComponent(token)}`);
      return;
    }

    if (request.method === "POST" && url.pathname === "/register") {
      const form = await parseBody(request);
      const inviteToken = String(form.inviteToken ?? "").trim() || null;
      const inviteOptions = inviteToken ? await registerPageOptionsForToken(inviteToken) : undefined;
      const role = String(form.role ?? (inviteToken ? "driver" : "company")) as "company" | "retailer" | "driver";
      const values = {
        name: String(form.name ?? ""),
        email: String(form.email ?? ""),
        companyName: String(form.companyName ?? ""),
        retailerName: String(form.retailerName ?? ""),
        driverName: String(form.driverName ?? ""),
        phone: String(form.phone ?? "")
      };

      if (inviteToken && role !== "driver") {
        sendHtml(
          response,
          RegisterPage({
            ...inviteOptions,
            selectedRole: role,
            values,
            inviteStatus: "invalid-role",
            inviteError: "Este convite exige cadastro como entregador."
          }),
          400
        );
        return;
      }

      try {
        const upstream = await authClient.register({
          name: String(form.name ?? ""),
          email: String(form.email ?? ""),
          password: String(form.password ?? ""),
          role,
          ...(role === "company" ? { companyName: String(form.companyName ?? "") } : {}),
          ...(role === "retailer" ? { retailerName: String(form.retailerName ?? "") } : {}),
          ...(role === "driver" ? { driverName: String(form.driverName ?? ""), phone: String(form.phone ?? "") } : {})
        } as never);
        forwardCookies(upstream, response);

        if (inviteToken) {
          const cookieHeader = upstream.headers.get("set-cookie") ?? response.getHeader("set-cookie");
          const normalizedCookieHeader = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : typeof cookieHeader === "string" ? cookieHeader : null;

          try {
            const redeemed = await redeemInvitationByToken(inviteToken, normalizedCookieHeader);
            if (!redeemed) {
              throw new Error("invitation_redeem_unauthorized");
            }
            redirect(response, `/dashboard?invitationRedeemed=${encodeURIComponent(redeemed.invitationId)}`);
          } catch (error) {
            sendHtml(
              response,
              RegisterPage({
                ...inviteOptions,
                selectedRole: "driver",
                values,
                inviteError: `Cadastro concluído, mas o aceite automático falhou. Diagnóstico: ${error instanceof Error ? error.message : "invitation_redeem_failed"}`
              }),
              409
            );
          }
          return;
        }

        redirect(response, "/dashboard");
      } catch (error) {
        sendHtml(
          response,
          RegisterPage({
            ...inviteOptions,
            selectedRole: role,
            values,
            inviteError: inviteOptions?.inviteError
          }).replace(
            "</main>",
            `<div role=\"alert\" style=\"margin-top:16px;padding:12px;border-radius:10px;background:#fef2f2;color:#991b1b;\">${escapeHtml(error instanceof Error ? error.message : "register_failed")}</div></main>`
          ),
          400
        );
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/dashboard/invitations") {
      const fetchRequest = requestToFetchRequest(request);
      const session = await getSessionFromRequest(fetchRequest);
      if (!session?.user) {
        redirect(response, "/login");
        return;
      }

      const form = await parseBody(request);
      const channel = String(form.channel ?? "link") as "whatsapp" | "email" | "link" | "manual";
      const invitedContact = String(form.invitedContact ?? "").trim() || null;
      await rerenderDashboard(response, request.headers.cookie ?? null, {
        createInvitation: {
          channel,
          invitedContact
        }
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/dashboard/deliveries") {
      const fetchRequest = requestToFetchRequest(request);
      const session = await getSessionFromRequest(fetchRequest);
      if (!session?.user) {
        redirect(response, "/login");
        return;
      }

      const form = await parseBody(request);
      const createDeliveryInput: CreateDeliveryInput = {
        companyId: String(form.companyId ?? "").trim(),
        externalReference: normalizeMaybeNull(form.externalReference),
        pickupAddress: normalizeMaybeNull(form.pickupAddress),
        dropoffAddress: normalizeMaybeNull(form.dropoffAddress),
        metadata: normalizeMaybeNull(form.notes) ? { notes: normalizeMaybeNull(form.notes) } : undefined
      };

      await rerenderDashboard(response, request.headers.cookie ?? null, {
        createDelivery: createDeliveryInput
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/dashboard/driver-offer") {
      const fetchRequest = requestToFetchRequest(request);
      const session = await getSessionFromRequest(fetchRequest);
      if (!session?.user) {
        redirect(response, "/login");
        return;
      }

      const form = await parseBody(request);
      const resolveOfferInput: ResolveDriverOfferInput = {
        deliveryId: String(form.deliveryId ?? "").trim(),
        decision: (String(form.decision ?? "reject").trim() === "accept" ? "accept" : "reject") as ResolveDriverOfferInput["decision"],
        reason: normalizeMaybeNull(form.reason)
      };

      await rerenderDashboard(response, request.headers.cookie ?? null, {
        resolveDriverOffer: resolveOfferInput
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/dashboard/deliveries/transition") {
      const fetchRequest = requestToFetchRequest(request);
      const session = await getSessionFromRequest(fetchRequest);
      if (!session?.user) {
        redirect(response, "/login");
        return;
      }

      const form = await parseBody(request);
      const transitionInput: TransitionDeliveryInput = {
        deliveryId: String(form.deliveryId ?? "").trim(),
        status: String(form.status ?? "assigned").trim() as TransitionDeliveryInput["status"],
        metadata: normalizeMaybeNull(form.notes) ? { notes: normalizeMaybeNull(form.notes) } : undefined
      };

      await rerenderDashboard(response, request.headers.cookie ?? null, {
        transitionDelivery: transitionInput
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/dashboard") {
      const fetchRequest = requestToFetchRequest(request);
      const session = await getSessionFromRequest(fetchRequest);
      if (!session?.user) {
        redirect(response, "/login");
        return;
      }

      await rerenderDashboard(response, request.headers.cookie ?? null);
      return;
    }

    if (url.pathname.startsWith("/api/auth/")) {
      const proxyUrl = new URL(url.pathname + url.search, env.apiUrl);
      const upstream = await fetch(proxyUrl.toString(), {
        method: request.method,
        headers: {
          cookie: request.headers.cookie ?? "",
          origin: env.appUrl,
          ...(request.headers["content-type"] ? { "content-type": String(request.headers["content-type"]) } : {})
        },
        body: request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.from(JSON.stringify(await parseBody(request)))
      });
      forwardCookies(upstream, response);
      response.statusCode = upstream.status;
      response.end(await upstream.text());
      return;
    }

    sendText(response, `Not found: ${url.pathname}`, 404);
  } catch (error) {
    sendText(response, error instanceof Error ? error.message : "unknown_error", 500);
  }
});

export const startDashboard = () =>
  new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3000, "127.0.0.1", () => {
      server.off("error", reject);
      console.log("dashboard_ready:http://127.0.0.1:3000");
      resolve();
    });
  });

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  void startDashboard();
}
