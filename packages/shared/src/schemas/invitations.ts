import { z } from "zod";
import { invitationChannels, invitationStatuses } from "../types/invitations";

export const invitationChannelSchema = z.enum(invitationChannels);
export const invitationStatusSchema = z.enum(invitationStatuses);

export const invitationTokenSchema = z.string().min(16).max(255);

export const createInvitationSchema = z.object({
  channel: invitationChannelSchema,
  invitedContact: z.string().trim().min(3).max(255).optional().nullable(),
  expiresAt: z.string().datetime().optional()
});

export const invitationListItemSchema = z.object({
  invitationId: z.string().uuid(),
  companyId: z.string().uuid(),
  token: invitationTokenSchema,
  channel: invitationChannelSchema,
  status: invitationStatusSchema,
  invitedContact: z.string().nullable().optional(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
  createdByUserId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const companyInvitationListSchema = z.array(invitationListItemSchema);

export const lookupInvitationSchema = z.object({
  token: invitationTokenSchema
});

export const lookupInvitationResultSchema = z.object({
  invitationId: z.string().uuid(),
  companyId: z.string().uuid(),
  companyName: z.string(),
  companySlug: z.string(),
  token: invitationTokenSchema,
  channel: invitationChannelSchema,
  status: invitationStatusSchema,
  invitedContact: z.string().nullable().optional(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable().optional()
});

export const redeemInvitationSchema = z.object({
  token: invitationTokenSchema
});

export const redeemInvitationResultSchema = z.object({
  invitationId: z.string().uuid(),
  companyId: z.string().uuid(),
  driverId: z.string().uuid(),
  bondId: z.string().uuid(),
  invitationStatus: z.literal("accepted"),
  bondStatus: z.literal("active"),
  diagnostics: z.object({
    bondAction: z.enum(["created", "reactivated", "reused"])
  })
});
