import { z } from "zod";
import { companyBondListsSchema } from "@repo/shared";
import { buildApiUrl } from "./auth";
import { env } from "./env";

const userMeSchema = z.object({
  user: z.object({
    id: z.string().min(1).optional(),
    name: z.string(),
    email: z.string().email(),
    role: z.string()
  }),
  profile: z
    .object({
      id: z.string().uuid().optional(),
      name: z.string().nullable().optional(),
      slug: z.string().nullable().optional(),
      stripeCustomerId: z.string().nullable().optional()
    })
    .nullable()
    .optional(),
  diagnostics: z
    .object({
      role: z.string().optional(),
      profileCreated: z.boolean().optional(),
      stripeStage: z.string().optional()
    })
    .nullable()
    .optional()
});

const trpcEnvelopeSchema = z.object({
  result: z
    .object({
      data: z
        .object({
          json: z.unknown().optional()
        })
        .passthrough()
        .optional()
    })
    .optional(),
  error: z
    .object({
      message: z.string().optional(),
      json: z
        .object({
          message: z.string().optional()
        })
        .passthrough()
        .optional()
    })
    .passthrough()
    .optional()
});

export type CurrentUser = z.infer<typeof userMeSchema>;
export type CompanyBondLists = z.infer<typeof companyBondListsSchema>;

export type DashboardCompanyViewModel = {
  user: CurrentUser["user"];
  profile?: CurrentUser["profile"];
  diagnostics?: CurrentUser["diagnostics"];
  bonds: CompanyBondLists;
  bondsState: "loaded" | "empty" | "error" | "not-company";
  bondsError?: string;
};

const defaultBondLists = (): CompanyBondLists => ({
  pendingRetailers: [],
  activeRetailers: [],
  activeDrivers: []
});

const parseTrpcPayload = async (response: Response) => {
  const json = await response.json();
  const envelope = trpcEnvelopeSchema.parse(json);

  if (envelope.error) {
    const errorMessage = envelope.error.json?.message ?? envelope.error.message ?? "unknown_trpc_error";
    throw new Error(errorMessage);
  }

  return envelope.result?.data && typeof envelope.result.data === "object" && "json" in envelope.result.data
    ? envelope.result.data.json
    : envelope.result?.data ?? json;
};

const fetchTrpc = async <T>(path: string, schema: z.ZodSchema<T>, cookieHeader?: string | null) => {
  const response = await fetch(buildApiUrl(`/trpc/${path}`), {
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      origin: env.appUrl
    }
  });

  if (response.status === 401 || response.status === 403) {
    return { kind: "unauthorized" as const };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`trpc_${path.replace(/\./g, "_")}_failed:${response.status}:${body}`);
  }

  const payload = await parseTrpcPayload(response);
  return { kind: "ok" as const, data: schema.parse(payload) };
};

export const getCurrentUser = async (cookieHeader?: string | null) => {
  const result = await fetchTrpc("user.me", userMeSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getCompanyBondLists = async (cookieHeader?: string | null) => {
  const result = await fetchTrpc("bonds.listCompanyBonds", companyBondListsSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getDashboardCompanyViewModel = async (cookieHeader?: string | null): Promise<DashboardCompanyViewModel | null> => {
  const currentUser = await getCurrentUser(cookieHeader);

  if (!currentUser?.user) {
    return null;
  }

  if (currentUser.user.role !== "company") {
    return {
      user: currentUser.user,
      profile: currentUser.profile,
      diagnostics: currentUser.diagnostics,
      bonds: defaultBondLists(),
      bondsState: "not-company",
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard."
    };
  }

  try {
    const bonds = await getCompanyBondLists(cookieHeader);
    if (!bonds) {
      return {
        user: currentUser.user,
        profile: currentUser.profile,
        diagnostics: currentUser.diagnostics,
        bonds: defaultBondLists(),
        bondsState: "error",
        bondsError: "A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados."
      };
    }

    const hasAnyBond = bonds.pendingRetailers.length > 0 || bonds.activeRetailers.length > 0 || bonds.activeDrivers.length > 0;

    return {
      user: currentUser.user,
      profile: currentUser.profile,
      diagnostics: currentUser.diagnostics,
      bonds,
      bondsState: hasAnyBond ? "loaded" : "empty"
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_bond_load_error";
    return {
      user: currentUser.user,
      profile: currentUser.profile,
      diagnostics: currentUser.diagnostics,
      bonds: defaultBondLists(),
      bondsState: "error",
      bondsError: `A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados. Diagnóstico: ${detail}`
    };
  }
};
