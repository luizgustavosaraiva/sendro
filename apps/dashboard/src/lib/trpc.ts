import { z } from "zod";
import {
  companyBondListsSchema,
  companyInvitationListSchema,
  createDeliverySchema,
  deliveryCompletionSchema,
  deliveryDetailSchema,
  deliveryListSchema,
  dispatchQueueListSchema,
  lookupInvitationResultSchema,
  redeemInvitationResultSchema,
  reprocessDispatchTimeoutsResultSchema,
  resolveDriverOfferResultSchema,
  resolveDriverOfferSchema,
  transitionDeliverySchema,
  operationsSummarySchema,
  companyDriversOperationalListSchema,
  connectResultSchema,
  billingConnectOnboardingCreateSchema,
  billingConnectOnboardingCreateResultSchema,
  billingConnectStatusSchema,
  pricingRuleCreateSchema,
  pricingRuleListResultSchema,
  billingReportListSchema,
  billingReportSummarySchema,
  whatsappSessionStatusSchema,
  type BillingConnectOnboardingCreateInput,
  type BillingConnectOnboardingCreateResult,
  type BillingConnectStatus,
  type BillingReportListInput,
  type BillingReportSummary,
  type CompanyDriverOperationalState,
  type ConnectResult,
  type CreateDeliveryInput,
  type DeliveryCompletionInput,
  type DeliveryDetail,
  type DeliveryListItem,
  type DeliveryStatus,
  type DriverStrike,
  type OperationsSummary,
  type PricingRule,
  type PricingRuleCreateInput,
  type ReprocessDispatchTimeoutsResult,
  type ResolveDriverOfferInput,
  type ResolveDriverOfferResult,
  type TransitionDeliveryInput,
  type WhatsAppSessionStatus
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

type DashboardDeliveryMutationFeedback = {
  kind: "created" | "transitioned" | "completed";
  deliveryId: string;
  status: DeliveryStatus;
  message: string;
};

export type DashboardDriverDeliveriesViewModel = {
  state: "loaded" | "empty" | "error" | "not-driver";
  deliveries: DeliveryListItem[];
  error?: string;
  activeOffer?: DeliveryListItem | null;
  offerState?: "loaded" | "empty" | "error" | "not-driver";
  offerError?: string;
  strikeSummary?: {
    total: number;
    lastStrike: DriverStrike | null;
    activeConsequence: string | null;
    bondStatus: string | null;
  };
  strikeState?: "loaded" | "empty" | "error" | "not-driver";
  resolutionFeedback?: {
    resolution: ResolveDriverOfferResult["resolution"];
    attemptId: string;
    queueEntryId: string;
    deliveryId: string;
    status: DeliveryStatus;
    strike: DriverStrike | null;
    message: string;
  };
};

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

export type DashboardRetailerDeliveriesViewModel = {
  state: "loaded" | "empty" | "error" | "not-retailer";
  deliveries: DeliveryListItem[];
  error?: string;
  createFeedback?: DashboardDeliveryMutationFeedback;
};

export type DashboardCompanyDeliveriesViewModel = {
  state: "loaded" | "empty" | "error" | "not-company";
  deliveries: DeliveryListItem[];
  activeQueue: DeliveryListItem[];
  waitingQueue: DeliveryListItem[];
  error?: string;
  queueError?: string;
  waitingError?: string;
  transitionFeedback?: DashboardDeliveryMutationFeedback;
  completionFeedback?: DashboardDeliveryMutationFeedback;
  reprocessFeedback?: {
    message: string;
    result: ReprocessDispatchTimeoutsResult;
  };
};

export type DashboardBillingReportFilters = {
  periodStart: string;
  periodEnd: string;
  page: number;
  limit: number;
};

export type DashboardCompanyBillingViewModel = {
  state: "loaded" | "empty" | "error" | "not-company";
  rules: PricingRule[];
  error?: string;
  createFeedback?: {
    ruleId: string;
    message: string;
  };
  connect: {
    state: "loaded" | "error" | "not-company";
    status?: BillingConnectStatus;
    error?: string;
  };
  financialKpis: {
    state: "loaded" | "empty" | "error" | "not-company";
    grossRevenueCents?: number;
    netRevenueCents?: number;
    error?: string;
  };
  report: {
    state: "loaded" | "empty" | "error" | "not-company";
    filters: DashboardBillingReportFilters;
    data?: BillingReportSummary;
    error?: string;
  };
};

export type DashboardCompanyViewModel = {
  user: CurrentUser["user"];
  profile?: CurrentUser["profile"];
  diagnostics?: CurrentUser["diagnostics"];
  bonds: CompanyBondLists;
  bondsState: "loaded" | "empty" | "error" | "not-company";
  bondsError?: string;
  summary: OperationsSummary | null;
  summaryState: "loaded" | "empty" | "error" | "not-company";
  summaryError?: string;
  driversOperational: CompanyDriverOperationalState[];
  driversState: "loaded" | "empty" | "error" | "not-company";
  driversError?: string;
  invitations: DashboardCompanyInvitationViewModel;
  retailerDeliveries: DashboardRetailerDeliveriesViewModel;
  companyDeliveries: DashboardCompanyDeliveriesViewModel;
  driverDeliveries: DashboardDriverDeliveriesViewModel;
  billing?: DashboardCompanyBillingViewModel;
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

const defaultRetailerDeliveriesViewModel = (): DashboardRetailerDeliveriesViewModel => ({
  deliveries: [],
  state: "empty"
});

const defaultCompanyDeliveriesViewModel = (): DashboardCompanyDeliveriesViewModel => ({
  deliveries: [],
  activeQueue: [],
  waitingQueue: [],
  state: "empty"
});

const defaultDriverDeliveriesViewModel = (): DashboardDriverDeliveriesViewModel => ({
  deliveries: [],
  activeOffer: null,
  offerState: "empty",
  strikeSummary: {
    total: 0,
    lastStrike: null,
    activeConsequence: null,
    bondStatus: null
  },
  strikeState: "empty",
  state: "empty"
});

const defaultBillingReportFilters = (): DashboardBillingReportFilters => {
  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStartDate = new Date(now);
  periodStartDate.setDate(periodStartDate.getDate() - 30);

  return {
    periodStart: periodStartDate.toISOString(),
    periodEnd,
    page: 1,
    limit: 50
  };
};

const defaultBillingViewModel = (): DashboardCompanyBillingViewModel => ({
  rules: [],
  state: "empty",
  connect: {
    state: "error",
    error: "billing_connect_unavailable"
  },
  financialKpis: {
    state: "empty"
  },
  report: {
    state: "empty",
    filters: defaultBillingReportFilters()
  }
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

const fetchTrpc = async <T>(path: string, schema: z.ZodSchema<T>, cookieHeader?: string | null, input?: unknown) => {
  const requestUrl = new URL(buildApiUrl(`/trpc/${path}`));
  if (typeof input !== "undefined") {
    requestUrl.searchParams.set("input", JSON.stringify(input));
  }

  const response = await fetch(requestUrl, {
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

export const getDeliveries = async (cookieHeader?: string | null, input?: { status?: DeliveryStatus }) => {
  const result = await fetchTrpc(
    "deliveries.list",
    deliveryListSchema,
    cookieHeader,
    input && Object.keys(input).length > 0 ? input : undefined
  );
  return result.kind === "unauthorized" ? null : result.data;
};

export const getDeliveryDetail = async (deliveryId: string, cookieHeader?: string | null) => {
  const result = await fetchTrpc("deliveries.detail", deliveryDetailSchema, cookieHeader, { deliveryId });
  return result.kind === "unauthorized" ? null : result.data;
};

export const createRetailerDelivery = async (input: CreateDeliveryInput, cookieHeader?: string | null) => {
  const parsedInput = createDeliverySchema.parse(input);
  const result = await postTrpc("deliveries.create", parsedInput, deliveryDetailSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const transitionCompanyDelivery = async (input: TransitionDeliveryInput, cookieHeader?: string | null) => {
  const parsedInput = transitionDeliverySchema.parse(input);
  const result = await postTrpc("deliveries.transition", parsedInput, deliveryDetailSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const completeDeliveryWithProof = async (input: DeliveryCompletionInput, cookieHeader?: string | null) => {
  const parsedInput = deliveryCompletionSchema.parse(input);
  const result = await postTrpc("deliveries.complete", parsedInput, deliveryDetailSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const resolveDriverDeliveryOffer = async (input: ResolveDriverOfferInput, cookieHeader?: string | null) => {
  const parsedInput = resolveDriverOfferSchema.parse(input);
  const result = await postTrpc("deliveries.resolveOffer", parsedInput, resolveDriverOfferResultSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getDispatchQueue = async (cookieHeader?: string | null, input?: { phase?: "queued" | "offered" }) => {
  const result = await fetchTrpc(
    "deliveries.dispatchQueue",
    dispatchQueueListSchema,
    cookieHeader,
    input && Object.keys(input).length > 0 ? input : undefined
  );
  return result.kind === "unauthorized" ? null : result.data;
};

export const getWaitingQueue = async (
  cookieHeader?: string | null,
  input?: { reason?: "max_private_attempts_reached" | "no_candidates_available" }
) => {
  const result = await fetchTrpc(
    "deliveries.waitingQueue",
    dispatchQueueListSchema,
    cookieHeader,
    input && Object.keys(input).length > 0 ? input : undefined
  );
  return result.kind === "unauthorized" ? null : result.data;
};

export const reprocessCompanyDispatch = async (input: { nowIso?: string; companyId?: string }, cookieHeader?: string | null) => {
  const result = await postTrpc("deliveries.reprocessTimeouts", input, reprocessDispatchTimeoutsResultSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getOperationsSummary = async (
  cookieHeader?: string | null,
  input?: { window?: "all_time" | "last_24h" }
) => {
  const result = await fetchTrpc(
    "deliveries.operationsSummary",
    operationsSummarySchema,
    cookieHeader,
    input && Object.keys(input).length > 0 ? input : undefined
  );
  return result.kind === "unauthorized" ? null : result.data;
};

export const getCompanyDriversOperational = async (cookieHeader?: string | null) => {
  const result = await fetchTrpc("deliveries.companyDriversOperational", companyDriversOperationalListSchema, cookieHeader);
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

export const listCompanyPricingRules = async (cookieHeader?: string | null) => {
  const result = await fetchTrpc("pricingRules.list", pricingRuleListResultSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const createCompanyPricingRule = async (input: PricingRuleCreateInput, cookieHeader?: string | null) => {
  const parsedInput = pricingRuleCreateSchema.parse(input);
  const result = await postTrpc("pricingRules.create", parsedInput, pricingRuleListResultSchema.element, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getBillingConnectStatus = async (cookieHeader?: string | null) => {
  const result = await fetchTrpc("billing.connectStatus", billingConnectStatusSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const getBillingReport = async (input: BillingReportListInput, cookieHeader?: string | null) => {
  const parsedInput = billingReportListSchema.parse(input);
  const result = await fetchTrpc("billing.report", billingReportSummarySchema, cookieHeader, parsedInput);
  return result.kind === "unauthorized" ? null : result.data;
};

export const createBillingConnectOnboarding = async (
  input: BillingConnectOnboardingCreateInput,
  cookieHeader?: string | null
): Promise<BillingConnectOnboardingCreateResult | null> => {
  const parsedInput = billingConnectOnboardingCreateSchema.parse(input);
  const result = await postTrpc("billing.connectStripe", parsedInput, billingConnectOnboardingCreateResultSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

const buildDriverStrikeSummary = (deliveries: DeliveryListItem[]) => {
  const strikes = deliveries.flatMap((delivery) => delivery.dispatch?.strikes ?? []);
  if (strikes.length === 0) {
    const lastBondStatus = deliveries
      .map((delivery) => {
        const offeredDriverId = delivery.dispatch?.offeredDriverId ?? null;
        if (!offeredDriverId || offeredDriverId !== delivery.driverId) return null;
        return null;
      })
      .find((value) => value !== undefined);

    return {
      total: 0,
      lastStrike: null,
      activeConsequence: null,
      bondStatus: lastBondStatus ?? null
    };
  }

  const sorted = [...strikes].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const lastStrike = sorted[0];

  return {
    total: strikes.length,
    lastStrike,
    activeConsequence: lastStrike.consequence,
    bondStatus:
      lastStrike.consequence === "bond_revoked"
        ? "revoked"
        : lastStrike.consequence === "bond_suspended"
          ? "suspended"
          : "active"
  };
};

export const getDashboardCompanyViewModel = async (
  cookieHeader?: string | null,
  options?: {
    createInvitation?: {
      channel: "whatsapp" | "email" | "link" | "manual";
      invitedContact?: string | null;
    } | null;
    createDelivery?: CreateDeliveryInput | null;
    transitionDelivery?: TransitionDeliveryInput | null;
    completeDelivery?: DeliveryCompletionInput | null;
    reprocessDispatch?: { nowIso?: string; companyId?: string } | null;
    resolveDriverOffer?: ResolveDriverOfferInput | null;
    createPricingRule?: PricingRuleCreateInput | null;
    billingConnectError?: string | null;
    billingReport?: BillingReportListInput | null;
  }
): Promise<DashboardCompanyViewModel | null> => {
  const currentUser = await getCurrentUser(cookieHeader);

  if (!currentUser?.user) {
    return null;
  }

  const isCompany = currentUser.user.role === "company";
  const isRetailer = currentUser.user.role === "retailer";
  const isDriver = currentUser.user.role === "driver";

  if (isDriver) {
    let driverDeliveries = defaultDriverDeliveriesViewModel();

    try {
      let resolutionFeedback: DashboardDriverDeliveriesViewModel["resolutionFeedback"];
      if (options?.resolveDriverOffer) {
        const resolved = await resolveDriverDeliveryOffer(options.resolveDriverOffer, cookieHeader);
        if (!resolved) {
          driverDeliveries = {
            ...defaultDriverDeliveriesViewModel(),
            state: "error",
            offerState: "error",
            strikeState: "error",
            error: "A sessão foi resolvida, mas a resposta da oferta não pôde ser enviada porque a autenticação SSR não foi aceita pela API.",
            offerError: "driver_offer_resolution_unauthorized"
          };
        } else {
          resolutionFeedback = {
            resolution: resolved.resolution,
            attemptId: resolved.attemptId,
            queueEntryId: resolved.queueEntryId,
            deliveryId: resolved.delivery.deliveryId,
            status: resolved.delivery.status,
            strike: resolved.strike,
            message:
              resolved.resolution === "accepted"
                ? `Oferta ${resolved.attemptId} aceita e entrega ${resolved.delivery.deliveryId} atualizada para ${resolved.delivery.status}.`
                : `Oferta ${resolved.attemptId} rejeitada para a entrega ${resolved.delivery.deliveryId}.`
          };
        }
      }

      if (driverDeliveries.state !== "error" && options?.completeDelivery) {
        const completed = await completeDeliveryWithProof(options.completeDelivery, cookieHeader);
        if (!completed) {
          driverDeliveries = {
            ...defaultDriverDeliveriesViewModel(),
            state: "error",
            offerState: "error",
            strikeState: "error",
            error: "A sessão foi resolvida, mas a prova de entrega não pôde ser enviada porque a autenticação SSR não foi aceita pela API.",
            offerError: "delivery_completion_unauthorized"
          };
        }
      }

      if (driverDeliveries.state !== "error") {
        const rows = await getDeliveries(cookieHeader);
        if (!rows) {
          driverDeliveries = {
            ...defaultDriverDeliveriesViewModel(),
            state: "error",
            offerState: "error",
            strikeState: "error",
            error: "A sessão foi resolvida, mas as entregas do entregador não puderam ser carregadas.",
            offerError: "driver_deliveries_unavailable"
          };
        } else {
          const activeOffer = rows.find((delivery) => delivery.dispatch?.phase === "offered" && delivery.dispatch?.activeAttemptId);
          const strikeSummary = buildDriverStrikeSummary(rows);
          const state = rows.length > 0 ? "loaded" : "empty";
          driverDeliveries = {
            deliveries: rows,
            state,
            activeOffer: activeOffer ?? null,
            offerState: activeOffer ? "loaded" : rows.length > 0 ? "empty" : "empty",
            strikeSummary,
            strikeState: strikeSummary.total > 0 ? "loaded" : "empty",
            resolutionFeedback
          };
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown_driver_delivery_load_error";
      driverDeliveries = {
        ...defaultDriverDeliveriesViewModel(),
        state: "error",
        offerState: "error",
        strikeState: "error",
        error: `A sessão foi resolvida, mas o estado do entregador não pôde ser carregado. Diagnóstico: ${detail}`,
        offerError: detail
      };
    }

    return {
      user: currentUser.user,
      profile: currentUser.profile,
      diagnostics: currentUser.diagnostics,
      bonds: defaultBondLists(),
      bondsState: "not-company",
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
      summary: null,
      summaryState: "not-company",
      summaryError: "Somente contas empresa visualizam KPIs operacionais da empresa.",
      driversOperational: [],
      driversState: "not-company",
      driversError: "Somente contas empresa visualizam a disponibilidade operacional dos entregadores.",
      invitations: {
        invitations: [],
        state: "not-company",
        error: "Somente contas empresa podem gerar e listar convites."
      },
      retailerDeliveries: {
        deliveries: [],
        state: "not-retailer",
        error: "Somente lojistas podem criar entregas pelo dashboard."
      },
      companyDeliveries: {
        deliveries: [],
        activeQueue: [],
        waitingQueue: [],
        state: "not-company",
        error: "Somente contas empresa visualizam a fila operacional de entregas."
      },
      driverDeliveries,
      billing: {
        rules: [],
        state: "not-company",
        error: "Somente contas empresa podem gerenciar regras de cobrança.",
        connect: {
          state: "not-company",
          error: "Somente contas empresa podem conectar Stripe Connect."
        },
        financialKpis: {
          state: "not-company",
          error: "Somente contas empresa visualizam KPIs financeiros."
        },
        report: {
          state: "not-company",
          filters: defaultBillingReportFilters(),
          error: "Somente contas empresa visualizam relatórios financeiros."
        }
      }
    };
  }

  if (!isCompany) {
    if (!isRetailer) {
      return {
        user: currentUser.user,
        profile: currentUser.profile,
        diagnostics: currentUser.diagnostics,
        bonds: defaultBondLists(),
        bondsState: "not-company",
        bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
        summary: null,
        summaryState: "not-company",
        summaryError: "Somente contas empresa visualizam KPIs operacionais da empresa.",
        driversOperational: [],
        driversState: "not-company",
        driversError: "Somente contas empresa visualizam a disponibilidade operacional dos entregadores.",
        invitations: {
          invitations: [],
          state: "not-company",
          error: "Somente contas empresa podem gerar e listar convites."
        },
        retailerDeliveries: {
          deliveries: [],
          state: "not-retailer",
          error: "Somente lojistas podem criar entregas pelo dashboard."
        },
        companyDeliveries: {
          deliveries: [],
          activeQueue: [],
          waitingQueue: [],
          state: "not-company",
          error: "Somente contas empresa visualizam a fila operacional de entregas."
        },
        driverDeliveries: {
          ...defaultDriverDeliveriesViewModel(),
          state: "not-driver",
          offerState: "not-driver",
          strikeState: "not-driver",
          error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard."
        },
        billing: {
          rules: [],
          state: "not-company",
          error: "Somente contas empresa podem gerenciar regras de cobrança.",
          connect: {
            state: "not-company",
            error: "Somente contas empresa podem conectar Stripe Connect."
          },
          financialKpis: {
            state: "not-company",
            error: "Somente contas empresa visualizam KPIs financeiros."
          },
          report: {
            state: "not-company",
            filters: defaultBillingReportFilters(),
            error: "Somente contas empresa visualizam relatórios financeiros."
          }
        }
      };
    }

    let retailerDeliveries = defaultRetailerDeliveriesViewModel();

    try {
      let createFeedback: DashboardRetailerDeliveriesViewModel["createFeedback"];
      if (options?.createDelivery) {
        const created = await createRetailerDelivery(options.createDelivery, cookieHeader);
        if (!created) {
          retailerDeliveries = {
            deliveries: [],
            state: "error",
            error: "A sessão foi resolvida, mas a entrega não pôde ser criada porque a autenticação SSR não foi aceita pela API."
          };
        } else {
          createFeedback = {
            kind: "created",
            deliveryId: created.deliveryId,
            status: created.status,
            message: `Entrega ${created.deliveryId} criada com status ${created.status}.`
          };
        }
      }

      if (retailerDeliveries.state !== "error") {
        const rows = await getDeliveries(cookieHeader);
        if (!rows) {
          retailerDeliveries = {
            deliveries: [],
            state: "error",
            error: "A sessão foi resolvida, mas as entregas do lojista não puderam ser carregadas."
          };
        } else {
          retailerDeliveries = {
            deliveries: rows,
            state: rows.length > 0 ? "loaded" : "empty",
            createFeedback
          };
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown_delivery_load_error";
      retailerDeliveries = {
        deliveries: [],
        state: "error",
        error: `A sessão foi resolvida, mas as entregas do lojista não puderam ser carregadas. Diagnóstico: ${detail}`
      };
    }

    return {
      user: currentUser.user,
      profile: currentUser.profile,
      diagnostics: currentUser.diagnostics,
      bonds: defaultBondLists(),
      bondsState: "not-company",
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
      summary: null,
      summaryState: "not-company",
      summaryError: "Somente contas empresa visualizam KPIs operacionais da empresa.",
      driversOperational: [],
      driversState: "not-company",
      driversError: "Somente contas empresa visualizam a disponibilidade operacional dos entregadores.",
      invitations: {
        invitations: [],
        state: "not-company",
        error: "Somente contas empresa podem gerar e listar convites."
      },
      retailerDeliveries,
      companyDeliveries: {
        deliveries: [],
        activeQueue: [],
        waitingQueue: [],
        state: "not-company",
        error: "Somente contas empresa visualizam a fila operacional de entregas."
      },
      driverDeliveries: {
        ...defaultDriverDeliveriesViewModel(),
        state: "not-driver",
        offerState: "not-driver",
        strikeState: "not-driver",
        error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard."
      },
      billing: {
        rules: [],
        state: "not-company",
        error: "Somente contas empresa podem gerenciar regras de cobrança.",
        connect: {
          state: "not-company",
          error: "Somente contas empresa podem conectar Stripe Connect."
        },
        financialKpis: {
          state: "not-company",
          error: "Somente contas empresa visualizam KPIs financeiros."
        },
        report: {
          state: "not-company",
          filters: defaultBillingReportFilters(),
          error: "Somente contas empresa visualizam relatórios financeiros."
        }
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

  let summary: OperationsSummary | null = null;
  let summaryState: DashboardCompanyViewModel["summaryState"] = "empty";
  let summaryError: string | undefined;

  let driversOperational: CompanyDriverOperationalState[] = [];
  let driversState: DashboardCompanyViewModel["driversState"] = "empty";
  let driversError: string | undefined;

  let invitations = defaultInvitationViewModel();

  let billing = defaultBillingViewModel();

  try {
    let createFeedback: DashboardCompanyBillingViewModel["createFeedback"];

    if (options?.createPricingRule) {
      try {
        const created = await createCompanyPricingRule(options.createPricingRule, cookieHeader);
        if (!created) {
          billing = {
            ...billing,
            rules: [],
            state: "error",
            error: "A sessão foi resolvida, mas a regra de cobrança não pôde ser criada porque a autenticação SSR não foi aceita pela API."
          };
        } else {
          createFeedback = {
            ruleId: created.ruleId,
            message: `Regra ${created.ruleId} criada para ${created.region}/${created.deliveryType}.`
          };
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "pricing_rule_create_failed";
        billing = {
          ...billing,
          rules: [],
          state: "error",
          error: `Falha ao criar regra de cobrança. Diagnóstico: ${detail}`
        };
      }
    }

    if (billing.state !== "error") {
      try {
        const rows = await listCompanyPricingRules(cookieHeader);
        if (!rows) {
          billing = {
            ...billing,
            rules: [],
            state: "error",
            error: "A sessão foi resolvida, mas a lista de regras de cobrança não pôde ser carregada."
          };
        } else {
          billing = {
            ...billing,
            rules: rows,
            state: rows.length > 0 ? "loaded" : "empty",
            createFeedback
          };
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "pricing_rule_list_failed";
        billing = {
          ...billing,
          rules: [],
          state: "error",
          error: `Falha ao carregar regras de cobrança. Diagnóstico: ${detail}`
        };
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "billing_unknown_failure";
    billing = {
      ...billing,
      rules: [],
      state: "error",
      error: `Falha ao resolver o bloco de cobrança no SSR. Diagnóstico: ${detail}`
    };
  }

  if (options?.billingConnectError) {
    billing.connect = {
      state: "error",
      error: options.billingConnectError
    };
  } else {
    try {
      const connectStatus = await getBillingConnectStatus(cookieHeader);
      if (!connectStatus) {
        billing.connect = {
          state: "error",
          error: "A sessão foi resolvida, mas o status do Stripe Connect não pôde ser carregado."
        };
      } else {
        billing.connect = {
          state: "loaded",
          status: connectStatus
        };
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "billing_connect_status_failed";
      billing.connect = {
        state: "error",
        error: `Falha ao carregar status do Stripe Connect. Diagnóstico: ${detail}`
      };
    }
  }

  const reportFilters = options?.billingReport ?? defaultBillingReportFilters();
  billing.report = {
    ...billing.report,
    filters: reportFilters
  };

  try {
    const report = await getBillingReport(reportFilters, cookieHeader);
    if (!report) {
      billing.report = {
        state: "error",
        filters: reportFilters,
        error: "A sessão foi resolvida, mas o relatório financeiro não pôde ser carregado."
      };
    } else {
      billing.report = {
        state: report.rows.length > 0 ? "loaded" : "empty",
        filters: reportFilters,
        data: report
      };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "billing_report_unavailable";
    billing.report = {
      state: "error",
      filters: reportFilters,
      error: `Falha ao carregar relatório financeiro. Diagnóstico: ${detail}`
    };
  }

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

    if (invitations.state !== "error") {
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
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_invitation_load_error";
    invitations = {
      invitations: [],
      state: "error",
      error: `A sessão foi resolvida, mas os convites não puderam ser carregados. Diagnóstico: ${detail}`
    };
  }

  let companyDeliveries = defaultCompanyDeliveriesViewModel();

  try {
    let transitionFeedback: DashboardCompanyDeliveriesViewModel["transitionFeedback"];
    let completionFeedback: DashboardCompanyDeliveriesViewModel["completionFeedback"];
    let reprocessFeedback: DashboardCompanyDeliveriesViewModel["reprocessFeedback"];
    let transitionedDetail: DeliveryDetail | undefined;

    if (options?.transitionDelivery) {
      const transitioned = await transitionCompanyDelivery(options.transitionDelivery, cookieHeader);
      if (!transitioned) {
        companyDeliveries = {
          deliveries: [],
          activeQueue: [],
          waitingQueue: [],
          state: "error",
          error: "A sessão foi resolvida, mas a transição da entrega não pôde ser executada porque a autenticação SSR não foi aceita pela API."
        };
      } else {
        transitionedDetail = transitioned;
        transitionFeedback = {
          kind: "transitioned",
          deliveryId: transitioned.deliveryId,
          status: transitioned.status,
          message: `Entrega ${transitioned.deliveryId} atualizada para ${transitioned.status}.`
        };
      }
    }

    if (companyDeliveries.state !== "error" && options?.completeDelivery) {
      const completed = await completeDeliveryWithProof(options.completeDelivery, cookieHeader);
      if (!completed) {
        companyDeliveries = {
          deliveries: [],
          activeQueue: [],
          waitingQueue: [],
          state: "error",
          error: "A sessão foi resolvida, mas a conclusão com prova não pôde ser executada porque a autenticação SSR não foi aceita pela API."
        };
      } else {
        transitionedDetail = completed;
        completionFeedback = {
          kind: "completed",
          deliveryId: completed.deliveryId,
          status: completed.status,
          message: `Entrega ${completed.deliveryId} concluída com prova em ${completed.proof?.deliveredAt ?? completed.updatedAt}.`
        };
      }
    }

    if (companyDeliveries.state !== "error" && options?.reprocessDispatch) {
      const reprocessed = await reprocessCompanyDispatch(options.reprocessDispatch, cookieHeader);
      if (!reprocessed) {
        companyDeliveries = {
          deliveries: [],
          activeQueue: [],
          waitingQueue: [],
          state: "error",
          error: "A sessão foi resolvida, mas o reprocessamento do dispatch não pôde ser executado porque a autenticação SSR não foi aceita pela API."
        };
      } else {
        reprocessFeedback = {
          message: `Dispatch reprocessado: ${reprocessed.expiredAttempts} tentativas expiradas, ${reprocessed.advancedAttempts} avançadas, ${reprocessed.movedToWaiting} movidas para waiting queue.`,
          result: reprocessed
        };
      }
    }

    if (companyDeliveries.state !== "error") {
      const [rowsResult, activeQueueResult, waitingQueueResult, summaryResult, driversResult] = await Promise.allSettled([
        getDeliveries(cookieHeader),
        getDispatchQueue(cookieHeader),
        getWaitingQueue(cookieHeader),
        getOperationsSummary(cookieHeader),
        getCompanyDriversOperational(cookieHeader)
      ]);

      const rows = rowsResult.status === "fulfilled" ? rowsResult.value : null;
      const activeQueueRows = activeQueueResult.status === "fulfilled" ? activeQueueResult.value : null;
      const waitingQueueRows = waitingQueueResult.status === "fulfilled" ? waitingQueueResult.value : null;

      const deliveriesRows = rows ?? [];
      const activeRows = activeQueueRows ?? [];
      const waitingRows = waitingQueueRows ?? [];
      const queueErrors: string[] = [];

      if (!rows) {
        queueErrors.push("A sessão foi resolvida, mas a fila geral de entregas da empresa não pôde ser carregada.");
      }
      if (!activeQueueRows) {
        queueErrors.push("A sessão foi resolvida, mas a fila ativa de dispatch não pôde ser carregada.");
      }
      if (!waitingQueueRows) {
        queueErrors.push("A sessão foi resolvida, mas a waiting queue não pôde ser carregada.");
      }

      if (queueErrors.length > 0) {
        companyDeliveries = {
          deliveries: deliveriesRows,
          activeQueue: activeRows,
          waitingQueue: waitingRows,
          state: "error",
          error: queueErrors.join(" "),
          queueError: !activeQueueRows ? "dispatch_queue_unavailable" : undefined,
          waitingError: !waitingQueueRows ? "waiting_queue_unavailable" : undefined,
          transitionFeedback,
          completionFeedback,
          reprocessFeedback
        };
      } else {
        const mergedRows = transitionedDetail
          ? deliveriesRows.map((row) => (row.deliveryId === transitionedDetail.deliveryId ? transitionedDetail : row))
          : deliveriesRows;
        const state = activeRows.length > 0 || waitingRows.length > 0 || mergedRows.length > 0 ? "loaded" : "empty";

        companyDeliveries = {
          deliveries: mergedRows,
          activeQueue: activeRows,
          waitingQueue: waitingRows,
          state,
          transitionFeedback,
          completionFeedback,
          reprocessFeedback
        };
      }

      if (summaryResult.status === "rejected") {
        const detail = summaryResult.reason instanceof Error ? summaryResult.reason.message : "operations_summary_unavailable";
        summary = null;
        summaryState = "error";
        summaryError = `A sessão foi resolvida, mas o summary operacional não pôde ser carregado. Diagnóstico: ${detail}`;
        billing.financialKpis = {
          state: "error",
          error: `Falha ao carregar KPIs financeiros. Diagnóstico: ${detail}`
        };
      } else if (!summaryResult.value) {
        summary = null;
        summaryState = "error";
        summaryError = "A sessão foi resolvida, mas o summary operacional não pôde ser carregado.";
        billing.financialKpis = {
          state: "error",
          error: "A sessão foi resolvida, mas os KPIs financeiros não puderam ser carregados."
        };
      } else {
        summary = summaryResult.value;
        const hasSummaryData =
          summary.kpis.awaitingAcceptance > 0 ||
          summary.kpis.waitingQueue > 0 ||
          summary.kpis.failedAttempts > 0 ||
          summary.kpis.delivered > 0 ||
          summary.kpis.activeDrivers > 0 ||
          summary.kpis.grossRevenueCents > 0 ||
          summary.kpis.netRevenueCents > 0;
        summaryState = hasSummaryData ? "loaded" : "empty";
        billing.financialKpis = {
          state: summary.kpis.grossRevenueCents > 0 || summary.kpis.netRevenueCents > 0 ? "loaded" : "empty",
          grossRevenueCents: summary.kpis.grossRevenueCents,
          netRevenueCents: summary.kpis.netRevenueCents
        };
      }

      if (driversResult.status === "rejected") {
        const detail = driversResult.reason instanceof Error ? driversResult.reason.message : "company_drivers_operational_unavailable";
        driversOperational = [];
        driversState = "error";
        driversError = `A sessão foi resolvida, mas a disponibilidade operacional dos entregadores não pôde ser carregada. Diagnóstico: ${detail}`;
      } else if (!driversResult.value) {
        driversOperational = [];
        driversState = "error";
        driversError = "A sessão foi resolvida, mas a disponibilidade operacional dos entregadores não pôde ser carregada.";
      } else {
        driversOperational = driversResult.value;
        driversState = driversOperational.length > 0 ? "loaded" : "empty";
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_company_delivery_load_error";
    companyDeliveries = {
      deliveries: [],
      activeQueue: [],
      waitingQueue: [],
      state: "error",
      error: `A sessão foi resolvida, mas a fila de entregas da empresa não pôde ser carregada. Diagnóstico: ${detail}`
    };
    summary = null;
    summaryState = "error";
    summaryError = `A sessão foi resolvida, mas o summary operacional não pôde ser carregado. Diagnóstico: ${detail}`;
    billing.financialKpis = {
      state: "error",
      error: `Falha ao carregar KPIs financeiros. Diagnóstico: ${detail}`
    };
    driversOperational = [];
    driversState = "error";
    driversError = `A sessão foi resolvida, mas a disponibilidade operacional dos entregadores não pôde ser carregada. Diagnóstico: ${detail}`;
  }

  return {
    user: currentUser.user,
    profile: currentUser.profile,
    diagnostics: currentUser.diagnostics,
    bonds,
    bondsState,
    bondsError,
    summary,
    summaryState,
    summaryError,
    driversOperational,
    driversState,
    driversError,
    invitations,
    retailerDeliveries: {
      deliveries: [],
      state: "not-retailer",
      error: "Somente lojistas podem criar entregas pelo dashboard."
    },
    companyDeliveries,
    driverDeliveries: {
      ...defaultDriverDeliveriesViewModel(),
      state: "not-driver",
      offerState: "not-driver",
      strikeState: "not-driver",
      error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard."
    },
    billing
  };
};

// ─── WhatsApp session view model ──────────────────────────────────────────────

export const whatsappSessionViewModelSchema = z.object({
  status: whatsappSessionStatusSchema,
  qrCode: z.string().nullable(),
  lastError: z.string().nullable().optional()
});

export type WhatsAppSessionViewModel = z.infer<typeof whatsappSessionViewModelSchema>;

export const getWhatsAppSessionStatus = async (cookieHeader?: string | null): Promise<WhatsAppSessionViewModel | null> => {
  const result = await fetchTrpc("whatsapp.sessionStatus", whatsappSessionViewModelSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const connectWhatsApp = async (cookieHeader?: string | null): Promise<ConnectResult | null> => {
  const result = await postTrpc("whatsapp.connect", {}, connectResultSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};

export const disconnectWhatsApp = async (cookieHeader?: string | null): Promise<{ status: WhatsAppSessionStatus } | null> => {
  const disconnectResultSchema = z.object({ status: whatsappSessionStatusSchema });
  const result = await postTrpc("whatsapp.disconnect", {}, disconnectResultSchema, cookieHeader);
  return result.kind === "unauthorized" ? null : result.data;
};
