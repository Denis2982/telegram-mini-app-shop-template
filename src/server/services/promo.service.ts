import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import type { PromoCodeDto, PromoDiscountType } from "@/types";
import { HttpError } from "../http";

export interface PromoCodeInput {
  code: string;
  discountType: PromoDiscountType;
  value: number;
  active: boolean;
}

export function parsePromoCodeInput(body: unknown): PromoCodeInput {
  if (!body || typeof body !== "object") throw new HttpError("Invalid promo code");
  const input = body as Record<string, unknown>;
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  const discountType = input.discountType;
  const value = input.value;

  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) {
    throw new HttpError("Code must contain 1–32 letters, numbers, hyphens or underscores");
  }
  if (discountType !== "percent" && discountType !== "fixed") {
    throw new HttpError("Invalid discount type");
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (discountType === "percent" && (!Number.isInteger(value) || value > 100)) ||
    (discountType === "fixed" && (value > 9_999_999_999.99 || Math.round(value * 100) / 100 !== value))
  ) {
    throw new HttpError(discountType === "percent" ? "Percent must be an integer from 1 to 100" : "Amount must be positive and have at most 2 decimal places");
  }
  if (typeof input.active !== "boolean") throw new HttpError("Invalid active status");

  return { code, discountType, value, active: input.active };
}

function toDto(row: typeof promoCodes.$inferSelect): PromoCodeDto {
  const discountType: PromoDiscountType = row.percent !== null ? "percent" : "fixed";
  return {
    code: row.code,
    discountType,
    value: discountType === "percent" ? row.percent ?? 0 : row.amount ?? 0,
    active: row.active,
    used: row.used,
    usageLimit: row.usageLimit,
  };
}

function toValues(input: PromoCodeInput) {
  return {
    code: input.code,
    percent: input.discountType === "percent" ? input.value : null,
    amount: input.discountType === "fixed" ? input.value : null,
    active: input.active,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function listPromoCodes(): Promise<PromoCodeDto[]> {
  const rows = await db.select().from(promoCodes).orderBy(asc(promoCodes.code));
  return rows.map(toDto);
}

export async function createPromoCode(input: PromoCodeInput): Promise<PromoCodeDto> {
  const [created] = await db.insert(promoCodes).values(toValues(input)).onConflictDoNothing().returning();
  if (!created) throw new HttpError("Promo code already exists", 409);
  return toDto(created);
}

export async function updatePromoCode(currentCode: string, input: PromoCodeInput): Promise<PromoCodeDto> {
  let updated: (typeof promoCodes.$inferSelect)[];
  try {
    updated = await db.update(promoCodes).set(toValues(input)).where(eq(promoCodes.code, currentCode)).returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError("Promo code already exists", 409);
    throw error;
  }
  if (!updated[0]) throw new HttpError("Promo code not found", 404);
  return toDto(updated[0]);
}

export async function deletePromoCode(code: string): Promise<void> {
  const deleted = await db.delete(promoCodes).where(eq(promoCodes.code, code)).returning({ code: promoCodes.code });
  if (!deleted.length) throw new HttpError("Promo code not found", 404);
}
