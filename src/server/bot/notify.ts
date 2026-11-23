import { Api, InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, type DbOrder, type DbOrderItem, type DbUser } from "@/db/schema";
import { formatMoney, getConfig } from "../config";
import { tr, trDefault } from "../locale";
import { getEffectiveConfig } from "../services/store-settings.service";

let api: Api | null = null;
let apiToken = "";

/** Plain grammY Api client (no handlers) – safe to import from services. */
export function getApi(): Api | null {
  const token = getConfig().botToken;
  if (!token) return null;
  if (!api || apiToken !== token) {
    api = new Api(token);
    apiToken = token;
  }
  return api;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function adminChat(): number | string | null {
  const id = getConfig().adminChatId;
  if (!id) return null;
  return /^-?\d+$/.test(id) ? Number(id) : id;
}

export function adminKeyboard(order: Pick<DbOrder, "id" | "status" | "paymentMethod" | "paymentStatus">) {
  const kb = new InlineKeyboard();
  const btn = (action: string) => kb.text(trDefault(`admin.btn.${action}`), `ord:${order.id}:${action}`);
  if (order.status === "completed" || order.status === "cancelled") return kb;
  if (order.paymentStatus !== "paid") {
    if (order.paymentMethod === "manual") btn("pay").row();
    btn("cancel");
  } else if (order.status === "paid") {
    btn("processing").row();
    btn("cancel");
  } else if (order.status === "processing") {
    btn("shipped").row();
    btn("cancel");
  } else if (order.status === "shipped") {
    btn("completed");
  }
  return kb;
}

export async function adminCardText(order: DbOrder, items: DbOrderItem[], user: DbUser | null) {
  const cfg = await getEffectiveConfig();
  const t = trDefault;
  const lines: string[] = [t("admin.newOrder", { id: order.id, status: esc(t(`status.${order.status}`)) })];
  const uname = order.customerUsername ? `(@${esc(order.customerUsername)})` : "";
  lines.push(t("admin.customer", { name: esc(order.customerName || user?.firstName || "—"), username: uname }));
  if (order.customerPhone) lines.push(t("admin.phone", { phone: esc(order.customerPhone) }));
  lines.push(t("admin.delivery", { method: t(`delivery.${order.deliveryMethod}`), address: esc(order.address || "—") }));
  lines.push(
    t("admin.payment", {
      method: t(`pay.${order.paymentMethod}`),
      state: order.paymentStatus === "paid" ? t("order.paid") : t("order.unpaid"),
    }),
  );
  lines.push("");
  for (const it of items) {
    const name = esc(it.name + (it.variantName ? ` (${it.variantName})` : ""));
    lines.push(`• ${name} × ${it.quantity} — ${formatMoney(it.price * it.quantity, cfg)}`);
  }
  lines.push("");
  if (order.discount > 0 && order.promoCode) {
    lines.push(t("admin.promo", { code: esc(order.promoCode), discount: formatMoney(order.discount, cfg) }));
  }
  if (order.comment) lines.push(t("admin.comment", { comment: esc(order.comment) }));
  lines.push(t("admin.total", { total: formatMoney(order.total, cfg) }));
  return lines.join("\n");
}

/** Sends the order card to the managers' chat and remembers the message id. */
export async function postAdminCard(order: DbOrder, items: DbOrderItem[], user: DbUser | null) {
  const a = getApi();
  const chat = adminChat();
  if (!a || chat === null) return;
  try {
    const msg = await a.sendMessage(chat, await adminCardText(order, items, user), {
      parse_mode: "HTML",
      reply_markup: adminKeyboard(order),
    });
    await db.update(orders).set({ adminMessageId: msg.message_id }).where(eq(orders.id, order.id));
  } catch (e) {
    console.error("postAdminCard failed", e);
  }
}

export async function refreshAdminCard(order: DbOrder, items: DbOrderItem[], user: DbUser | null) {
  const a = getApi();
  const chat = adminChat();
  if (!a || chat === null || !order.adminMessageId) return;
  try {
    await a.editMessageText(chat, order.adminMessageId, await adminCardText(order, items, user), {
      parse_mode: "HTML",
      reply_markup: adminKeyboard(order),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes("not modified")) console.error("refreshAdminCard failed", e);
  }
}

/** Transactional status message to the buyer. */
export async function notifyBuyer(order: DbOrder, user: DbUser | null) {
  const a = getApi();
  if (!a || !user) return;
  try {
    const cfg = await getEffectiveConfig();
    await a.sendMessage(
      user.tgId,
      tr(user.languageCode, `bot.notify.${order.status}`, {
        id: order.id,
        total: formatMoney(order.total, cfg),
      }),
    );
  } catch (e) {
    console.error("notifyBuyer failed", e);
  }
}
