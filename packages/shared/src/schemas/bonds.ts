import { z } from "zod";
import { bondDecisionActions, bondEntityTypes, bondStatuses } from "../types/bonds";

export const bondEntityTypeSchema = z.enum(bondEntityTypes);
export const bondStatusSchema = z.enum(bondStatuses);
export const bondDecisionActionSchema = z.enum(bondDecisionActions);

export const retailerBondRequestSchema = z.object({
  companyId: z.string().uuid()
});

export const bondDecisionSchema = z.object({
  bondId: z.string().uuid(),
  action: bondDecisionActionSchema
});

export const retailerCompanyBondGateSchema = z.object({
  companyId: z.string().uuid()
});

export const bondListItemSchema = z.object({
  bondId: z.string().uuid(),
  companyId: z.string().uuid(),
  entityId: z.string().uuid(),
  entityType: bondEntityTypeSchema,
  status: bondStatusSchema,
  requestedByUserId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  entityName: z.string(),
  entitySlug: z.string().nullable().optional(),
  entityLifecycle: z.string().nullable().optional()
});

export const companyBondListsSchema = z.object({
  pendingRetailers: z.array(bondListItemSchema),
  activeRetailers: z.array(bondListItemSchema),
  activeDrivers: z.array(bondListItemSchema)
});

export const retailerCompanyBondGateResultSchema = z.object({
  ok: z.literal(true),
  bondId: z.string().uuid(),
  companyId: z.string().uuid(),
  retailerId: z.string().uuid(),
  status: z.literal("active")
});
