export const GET = async (request: Request) => {
  const apiUrl = new URL(request.url);
  apiUrl.port = "3001";
  apiUrl.protocol = apiUrl.protocol || "http:";
  apiUrl.hostname = process.env.API_HOSTNAME ?? apiUrl.hostname;
  apiUrl.pathname = request.url.includes("/api/auth/")
    ? new URL(request.url).pathname.replace(/^\/api\/auth/, "/api/auth")
    : "/api/auth/get-session";

  const response = await fetch(apiUrl.toString(), {
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      origin: process.env.DASHBOARD_URL ?? "http://localhost:3000"
    },
    redirect: "manual"
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: response.headers
  });
};

export const POST = GET;
