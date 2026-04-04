export const bondEntityTypes = ["retailer", "driver"] as const;
export type BondEntityType = (typeof bondEntityTypes)[number];

export const bondStatuses = ["pending", "active", "suspended", "revoked"] as const;
export type BondStatus = (typeof bondStatuses)[number];

export const bondDecisionActions = ["approve", "revoke"] as const;
export type BondDecisionAction = (typeof bondDecisionActions)[number];

export type BondListItem = {
  bondId: string;
  companyId: string;
  entityId: string;
  entityType: BondEntityType;
  status: BondStatus;
  requestedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  entityName: string;
  entitySlug?: string | null;
  entityLifecycle?: string | null;
};

export type CompanyBondLists = {
  pendingRetailers: BondListItem[];
  activeRetailers: BondListItem[];
  activeDrivers: BondListItem[];
};

export type RetailerBondRequestInput = {
  companyId: string;
};

export type BondDecisionInput = {
  bondId: string;
  action: BondDecisionAction;
};

export type RetailerCompanyBondGateInput = {
  companyId: string;
};

export type RetailerCompanyBondGateResult = {
  ok: true;
  bondId: string;
  companyId: string;
  retailerId: string;
  status: "active";
};
