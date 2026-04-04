import { buildApiUrl } from "./auth";
import { env } from "./env";

export const getCurrentUser = async (cookieHeader?: string | null) => {
  const response = await fetch(buildApiUrl("/trpc/user.me"), {
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      origin: env.appUrl
    }
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`trpc_user_me_failed:${response.status}:${body}`);
  }

  const trpcBody = await response.json();
  return trpcBody.result?.data?.json ?? trpcBody.result?.data ?? trpcBody;
};
