export const entityRoles = ["company", "retailer", "driver"] as const;

export type EntityRole = (typeof entityRoles)[number];

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: EntityRole;
};

export type CompanyProfile = {
  role: "company";
  companyName: string;
};

export type RetailerProfile = {
  role: "retailer";
  retailerName: string;
};

export type DriverProfile = {
  role: "driver";
  driverName: string;
  phone: string;
};

export type AuthProfile = CompanyProfile | RetailerProfile | DriverProfile;

export type RegisterInput =
  | ({ name: string; email: string; password: string } & CompanyProfile)
  | ({ name: string; email: string; password: string } & RetailerProfile)
  | ({ name: string; email: string; password: string } & DriverProfile);

export type LoginInput = {
  email: string;
  password: string;
};

export type SessionContract = {
  user: AuthUser;
  profile: AuthProfile;
};
