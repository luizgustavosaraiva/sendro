import { z } from "zod";
import { entityRoles } from "../types/auth";

const baseRegisterSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

export const companyRegisterSchema = baseRegisterSchema.extend({
  role: z.literal("company"),
  companyName: z.string().min(2).max(160)
});

export const retailerRegisterSchema = baseRegisterSchema.extend({
  role: z.literal("retailer"),
  retailerName: z.string().min(2).max(160)
});

export const driverRegisterSchema = baseRegisterSchema.extend({
  role: z.literal("driver"),
  driverName: z.string().min(2).max(160),
  phone: z.string().min(8).max(20)
});

export const registerSchema = z.discriminatedUnion("role", [
  companyRegisterSchema,
  retailerRegisterSchema,
  driverRegisterSchema
]);

export const registerSchemaByRole = {
  company: companyRegisterSchema,
  retailer: retailerRegisterSchema,
  driver: driverRegisterSchema
} as const;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

export const entityRoleSchema = z.enum(entityRoles);
