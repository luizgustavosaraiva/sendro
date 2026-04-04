import { z } from "zod";
import {
  companyBondListsSchema,
  companyInvitationListSchema,
  lookupInvitationResultSchema,
  redeemInvitationResultSchema
} from "@repo/shared";
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

const invitationCreateResultSchema = companyInvitationListSchema.element;

const trpcEnvelopeSchema = z.object({
  result: z
    .object({
      data: z.unknown().optional()
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
export type CompanyInvitationListItem = z.infer<typeof invitationCreateResultSchema>;
export type PublicInvitationLookup = z.infer<typeof lookupInvitationResultSchema>;
export type InvitationRedeemResult = z.infer<typeof redeemInvitationResultSchema>;

export type DashboardCompanyInvitationViewModel = {
  invitations: CompanyInvitationListItem[];
  state: "loaded" | "empty" | "error" | "not-company";
  error?: string;
  generatedInvitation?: {
    token: string;
    inviteUrl: string;
    invitationId: string;
  };
};

export type DashboardCompanyViewModel = {
  user: CurrentUser["user"];
  profile?: CurrentUser["profile"];
  diagnostics?: CurrentUser["diagnostics"];
  bonds: CompanyBondLists;
  bondsState: "loaded" | "empty" | "error" | "not-company";
  bondsError?: string;
  invitations: DashboardCompanyInvitationViewModel;
};

const defaultBondLists = (): CompanyBondLists => ({
  pendingRetailers: [],
  activeRetailers: [],
  activeDrivers: []
});

const defaultInvitationViewModel = (): DashboardCompanyInvitationViewModel => ({
  invitations: [],
  state: "empty"
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

const postTrpc = async <TInput, TOutput>(
  path: string,
  input: TInput,
  schema: z.ZodSchema<TOutput>,
  cookieHeader?: string | null
) => {
  const response = await fetch(buildApiUrl(`/trpc/${path}`), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      origin: env.appUrl
    },
    body: JSON.stringify(input)
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

const buildInvitationUrl = (token: string) => new URL(`/invite/${token}`, env.appUrl).toString();

const listCompanyInvitations = async (cookieHeader?: string | null) => {
  const result = await fetchTrpc("invitations.listCompanyInvitations", companyInvitationListSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getCurrentUser = async (cookieHeader?: string | null) => {
  const result = await fetchTrpc("user.me", userMeSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getCompanyBondLists = async (cookieHeader?: string | null) => {
  const result = await fetchTrpc("bonds.listCompanyBonds", companyBondListsSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const lookupInvitationByToken = async (token: string) => {
  const response = await fetch(buildApiUrl(`/api/invitations/${encodeURIComponent(token)}`), {
    headers: {
      origin: env.appUrl
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`invitation_lookup_failed:${response.status}:${body}`);
  }

  return lookupInvitationResultSchema.parse(await response.json());
};

export const redeemInvitationByToken = async (token: string, cookieHeader?: string | null) => {
  const result = await postTrpc("invitations.redeemInvitation", { token }, redeemInvitationResultSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const createCompanyInvitation = async (
  input: { channel: "whatsapp" | "email" | "link" | "manual"; invitedContact?: string | null },
  cookieHeader?: string | null
) => {
  const result = await postTrpc("invitations.createCompanyInvitation", input, invitationCreateResultSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getDashboardCompanyViewModel = async (
  cookieHeader?: string | null,
  options?: {
    createInvitation?: {
      channel: "whatsapp" | "email" | "link" | "manual";
      invitedContact?: string | null;
    } | null;
  }
): Promise<DashboardCompanyViewModel | null> => {
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
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
      invitations: {
        invitations: [],
        state: "not-company",
        error: "Somente contas empresa podem gerar e listar convites."
      }
    };
  }

  let bonds = defaultBondLists();
  let bondsState: DashboardCompanyViewModel["bondsState"] = "empty";
  let bondsError: string | undefined;

  try {
    const bondLists = await getCompanyBondLists(cookieHeader);
    if (!bondLists) {
      bondsState = "error";
      bondsError = "A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados.";
    } else {
      bonds = bondLists;
      const hasAnyBond = bonds.pendingRetailers.length > 0 || bonds.activeRetailers.length > 0 || bonds.activeDrivers.length > 0;
      bondsState = hasAnyBond ? "loaded" : "empty";
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_bond_load_error";
    bondsState = "error";
    bondsError = `A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados. Diagnóstico: ${detail}`;
  }

  let invitations = defaultInvitationViewModel();

  try {
    let generatedInvitation: DashboardCompanyInvitationViewModel["generatedInvitation"];
    if (options?.createInvitation) {
      const created = await createCompanyInvitation(options.createInvitation, cookieHeader);
      if (!created) {
        invitations = {
          invitations: [],
          state: "error",
          error: "A sessão foi resolvida, mas o convite não pôde ser gerado porque a autenticação SSR não foi aceita pela API."
        };
      } else {
        generatedInvitation = {
          token: created.token,
          inviteUrl: buildInvitationUrl(created.token),
          invitationId: created.invitationId
        };
      }
    }

    const rows = await listCompanyInvitations(cookieHeader);
    if (!rows) {
      invitations = {
        invitations: [],
        state: "error",
        error: "A sessão foi resolvida, mas a lista de convites não pôde ser carregada."
      };
    } else {
      invitations = {
        invitations: rows,
        state: rows.length > 0 ? "loaded" : "empty",
        generatedInvitation
      };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_invitation_load_error";
    invitations = {
      invitations: [],
      state: "error",
      error: `A sessão foi resolvida, mas os convites não puderam ser carregados. Diagnóstico: ${detail}`
    };
  }

  return {
    user: currentUser.user,
    profile: currentUser.profile,
    diagnostics: currentUser.diagnostics,
    bonds,
    bondsState,
    bondsError,
    invitations
  };
};
