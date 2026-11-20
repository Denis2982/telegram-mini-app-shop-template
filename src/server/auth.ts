import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type DbUser } from "@/db/schema";
import { getConfig } from "./config";

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/** Validates Telegram WebApp initData signature (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
export function validateInitData(initData: string, botToken: string, maxAgeSec = 60 * 60 * 24): TgUser | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
    return user && typeof user.id === "number" ? user : null;
  } catch {
    return null;
  }
}

function readInitData(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("tma ") ? h.slice(4).trim() : "";
}

export async function upsertUser(tg: TgUser): Promise<DbUser> {
  const values = {
    tgId: tg.id,
    username: tg.username ?? null,
    firstName: tg.first_name ?? null,
    lastName: tg.last_name ?? null,
    languageCode: tg.language_code ?? null,
  };
  const [row] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.tgId,
      set: {
        username: values.username,
        firstName: values.firstName,
        lastName: values.lastName,
        languageCode: values.languageCode,
      },
    })
    .returning();
  return row;
}

/** Resolves the buyer from the Telegram initData header. Falls back to a demo user in dev mode. */
export async function getAuthUser(req: Request): Promise<DbUser | null> {
  const cfg = getConfig();
  const initData = readInitData(req);
  if (initData) {
    const tg = validateInitData(initData, cfg.botToken);
    if (tg) return upsertUser(tg);
    if (!cfg.allowDevAuth) return null;
  }
  if (cfg.allowDevAuth) {
    return upsertUser({ id: 1, first_name: "Demo", last_name: "User", username: "demo_user", language_code: cfg.defaultLocale });
  }
  return null;
}

export async function getUserByTgId(tgId: number) {
  const [u] = await db.select().from(users).where(eq(users.tgId, tgId)).limit(1);
  return u ?? null;
}

/** Admin access: either X-Admin-Key header or a Telegram user listed in ADMIN_IDS. */
export function isAdminRequest(req: Request): boolean {
  const cfg = getConfig();
  const key = req.headers.get("x-admin-key");
  if (key && cfg.adminApiKey && key === cfg.adminApiKey) return true;
  const initData = readInitData(req);
  if (initData) {
    const tg = validateInitData(initData, cfg.botToken);
    if (tg && cfg.adminIds.includes(tg.id)) return true;
  }
  return false;
}
