export const invitationChannels = ["whatsapp", "email", "link", "manual"] as const;
export type InvitationChannel = (typeof invitationChannels)[number];

export const invitationStatuses = ["pending", "accepted", "expired", "revoked"] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

export type CreateInvitationInput = {
  channel: InvitationChannel;
  invitedContact?: string | null;
  expiresAt?: string;
};

export type InvitationListItem = {
  invitationId: string;
  companyId: string;
  token: string;
  channel: InvitationChannel;
  status: InvitationStatus;
  invitedContact?: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LookupInvitationInput = {
  token: string;
};

export type LookupInvitationResult = {
  invitationId: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  token: string;
  channel: InvitationChannel;
  status: InvitationStatus;
  invitedContact?: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
};

export type RedeemInvitationInput = {
  token: string;
};

export type RedeemInvitationResult = {
  invitationId: string;
  companyId: string;
  driverId: string;
  bondId: string;
  invitationStatus: "accepted";
  bondStatus: "active";
  diagnostics: {
    bondAction: "created" | "reactivated" | "reused";
  };
};
