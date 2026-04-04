import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@repo/shared";
import { buildApiUrl } from "./auth";
import { env } from "./env";

const ensureOk = async (response: Response, stage: string) => {
  if (response.ok) {
    return response;
  }

  const body = await response.text();
  throw new Error(`${stage}:${response.status}:${body}`);
};

export const authClient = {
  async register(input: RegisterInput) {
    const payload = registerSchema.parse(input);
    const response = await fetch(buildApiUrl("/api/auth/sign-up/email"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: env.appUrl
      },
      body: JSON.stringify(payload),
      redirect: "manual"
    });

    return ensureOk(response, "register_failed");
  },
  async login(input: LoginInput) {
    const payload = loginSchema.parse(input);
    const response = await fetch(buildApiUrl("/api/auth/sign-in/email"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: env.appUrl
      },
      body: JSON.stringify(payload),
      redirect: "manual"
    });

    return ensureOk(response, "login_failed");
  }
};
