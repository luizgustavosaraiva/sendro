import { createServer } from "node:http";
import { parse as parseQuery } from "node:querystring";
import LoginPage from "./app/(auth)/login/page";
import RegisterPage from "./app/(auth)/register/page";
import { renderDashboardPage } from "./app/(app)/dashboard/page";
import { authClient } from "./lib/auth-client";
import { getSessionFromRequest } from "./lib/auth";
import { getCurrentUser } from "./lib/trpc";
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

const server = createServer(async (request, response) => {
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
      sendHtml(response, RegisterPage());
      return;
    }

    if (request.method === "POST" && url.pathname === "/register") {
      const form = await parseBody(request);
      const role = String(form.role ?? "company") as "company" | "retailer" | "driver";

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
        redirect(response, "/dashboard");
      } catch (error) {
        sendHtml(
          response,
          `<!DOCTYPE html><html><body><main><h1>Cadastro Sendro</h1><p role="alert">${error instanceof Error ? error.message : "register_failed"}</p></main></body></html>`,
          400
        );
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/dashboard") {
      const fetchRequest = requestToFetchRequest(request);
      const session = await getSessionFromRequest(fetchRequest);
      if (!session?.user) {
        redirect(response, "/login");
        return;
      }

      const currentUser = await getCurrentUser(request.headers.cookie ?? null);
      if (!currentUser?.user) {
        sendHtml(
          response,
          `<!DOCTYPE html><html><body><main><h1>Dashboard indisponível</h1><p role="alert">SSR session resolved but tRPC user.me failed.</p></main></body></html>`,
          502
        );
        return;
      }

      sendHtml(response, renderDashboardPage(currentUser));
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

server.listen(3000, "127.0.0.1", () => {
  console.log("dashboard_ready:http://127.0.0.1:3000");
});
