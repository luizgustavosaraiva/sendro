import { env } from "./env";

export const buildApiUrl = (path: string) => new URL(path, env.apiUrl).toString();

export const getSessionFromRequest = async (request: Request) => {
  const cookie = request.headers.get("cookie");
  const response = await fetch(buildApiUrl("/api/auth/get-session"), {
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: env.appUrl
    },
    redirect: "manual"
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`session_fetch_failed:${response.status}:${body}`);
  }

  return response.json();
};
