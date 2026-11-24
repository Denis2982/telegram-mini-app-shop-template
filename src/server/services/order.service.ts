import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderItems,
  orders,
  productVariants,
  products,
  promoCodes,
  users,
  type DbOrder,
  type DbOrderItem,
  type DbUser,
} from "@/db/schema";
import type { CreateOrderInput, OrderDto } from "@/types";
import { availablePaymentMethods, deliveryFeeFor } from "../config";
import { notifyBuyer, postAdminCard, refreshAdminCard } from "../bot/notify";
import { HttpError } from "../http";
import {
  adjustStock,
  PAYMENT_COMPLETION_GRACE_MS,
  releaseExpiredStockReservations,
  stockReservationExpiry,
} from "./stock.service";
import { getProvider } from "./payment";
import { getEffectiveConfig } from "./store-settings.service";

export type OrderAction = "pay" | "processing" | "shipped" | "completed" | "cancel";

type TelegramPaymentInfo = { telegramUserId: number; totalAmount: number; currency: string };
type ActionResult =
  | { error: "not_found" | "invalid_state" | "payment_mismatch" | "reservation_expired" | "out_of_stock" }
  | { order: DbOrder };

function expectedTelegramPayment(order: DbOrder, starsPerUnit: number) {
  if (order.paymentMethod === "stars") {
    return { currency: "XTR", amount: Math.max(1, Math.ceil(order.total * starsPerUnit)) };
  }
  if (order.paymentMethod === "card") {
    return { currency: order.currency, amount: Math.round(order.total * 100) };
  }
  return null;
}

export function toOrderDto(o: DbOrder, items: DbOrderItem[], user?: DbUser | null): OrderDto {
  return {
    id: o.id,
    status: o.status as OrderDto["status"],
    paymentMethod: o.paymentMethod as OrderDto["paymentMethod"],
    paymentStatus: o.paymentStatus as OrderDto["paymentStatus"],
    deliveryMethod: o.deliveryMethod as OrderDto["deliveryMethod"],
    address: o.address,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerUsername: o.customerUsername ?? user?.username ?? null,
    customerTelegramId: user?.tgId ?? null,
    comment: o.comment,
    promoCode: o.promoCode,
    subtotal: o.subtotal,
    discount: o.discount,
    deliveryFee: o.deliveryFee,
    total: o.total,
    currency: o.currency,
    createdAt: o.createdAt.toISOString(),
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      variantName: i.variantName,
      image: i.image,
      price: i.price,
      quantity: i.quantity,
    })),
  };
}

export async function getOrderFull(id: number) {
  await releaseExpiredStockReservations();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(orderItems.id);
  const [user] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
  return { order, items, user: user ?? null };
}

async function withItems(rows: DbOrder[]): Promise<OrderDto[]> {
  if (!rows.length) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    .orderBy(orderItems.id);
  const buyers = await db.select().from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.userId))]));
  return rows.map((o) =>
    toOrderDto(
      o,
      items.filter((i) => i.orderId === o.id),
      buyers.find((u) => u.id === o.userId) ?? null,
    ),
  );
}

export async function listUserOrders(userId: number, limit = 50) {
  await releaseExpiredStockReservations();
  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.id)).limit(limit);
  return withItems(rows);
}

export async function listAllOrders(limit?: number) {
  await releaseExpiredStockReservations();
  const query = db.select().from(orders).orderBy(desc(orders.id));
  const rows = limit ? await query.limit(limit) : await query;
  return withItems(rows);
}

export async function computePromo(code: string | undefined, subtotal: number) {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return null;
  const [p] = await db.select().from(promoCodes).where(eq(promoCodes.code, c)).limit(1);
  if (!p || !p.active) return null;
  if (p.usageLimit !== null && p.used >= p.usageLimit) return null;
  let discount = 0;
  if (p.percent) discount = Math.round((subtotal * p.percent) / 100);
  else if (p.amount) discount = Math.min(p.amount, subtotal);
  if (discount <= 0) return null;
  return { code: p.code, discount };
}

export async function createOrder(user: DbUser, input: CreateOrderInput) {
  const cfg = await getEffectiveConfig();
  if (!availablePaymentMethods(cfg).includes(input.paymentMethod)) throw new HttpError("Payment method unavailable");
  if (!["courier", "pickup", "post"].includes(input.deliveryMethod)) throw new HttpError("Invalid delivery method");
  const name = (input.name ?? "").trim().slice(0, 120);
  const phone = (input.phone ?? "").trim().slice(0, 40);
  const address = (input.address ?? "").trim().slice(0, 500);
  if (!name || !phone || !address) throw new HttpError("Name, phone and address are required");
  if (!Array.isArray(input.items) || input.items.length === 0) throw new HttpError("Cart is empty");

  // merge duplicated lines
  const lines = new Map<string, { productId: number; variantId: number | null; quantity: number }>();
  for (const it of input.items) {
    const quantity = Math.floor(Number(it.quantity));
    const productId = Number(it.productId);
    const variantId = it.variantId ? Number(it.variantId) : null;
    if (!Number.isInteger(productId) || !(quantity >= 1) || quantity > 99) throw new HttpError("Invalid cart item");
    const key = `${productId}:${variantId ?? 0}`;
    const prev = lines.get(key);
    if (prev) prev.quantity += quantity;
    else lines.set(key, { productId, variantId, quantity });
  }

  await releaseExpiredStockReservations();
  const created = await db.transaction(async (tx) => {
    const productIds = [...new Set([...lines.values()].map((l) => l.productId))];
    const prods = await tx.select().from(products).where(inArray(products.id, productIds));
    const vars = await tx.select().from(productVariants).where(inArray(productVariants.productId, productIds));

    const rows: Omit<typeof orderItems.$inferInsert, "orderId">[] = [];
    let subtotal = 0;
    for (const l of lines.values()) {
      const p = prods.find((x) => x.id === l.productId);
      if (!p || !p.active) throw new HttpError("Product not found", 404);
      const productVariantsList = vars.filter((v) => v.productId === p.id);
      let price = p.price;
      let stock = p.stock;
      let variantName: string | null = null;
      if (productVariantsList.length) {
        const v = productVariantsList.find((x) => x.id === l.variantId);
        if (!v) throw new HttpError(`Select an option for "${p.name}"`);
        price = v.price ?? p.price;
        stock = v.stock;
        variantName = v.name;
      } else if (l.variantId) {
        throw new HttpError("Invalid variant");
      }
      if (stock < l.quantity) throw new HttpError(`"${p.name}${variantName ? ` (${variantName})` : ""}" is out of stock`, 409);
      subtotal += price * l.quantity;
      rows.push({
        productId: p.id,
        variantId: l.variantId,
        sku: p.sku,
        name: p.name,
        variantName,
        image: p.images[0] ?? null,
        price,
        quantity: l.quantity,
      });
    }

    const promo = await computePromo(input.promoCode, subtotal);
    const discount = promo?.discount ?? 0;
    if (promo) {
      const upd = await tx
        .update(promoCodes)
        .set({ used: sql`${promoCodes.used} + 1` })
        .where(
          and(
            eq(promoCodes.code, promo.code),
            sql`(${promoCodes.usageLimit} is null or ${promoCodes.used} < ${promoCodes.usageLimit})`,
          ),
        )
        .returning({ id: promoCodes.id });
      if (!upd.length) throw new HttpError("Promo code is no longer valid");
    }
    const deliveryFee = deliveryFeeFor(input.deliveryMethod, subtotal - discount, cfg);
    const total = subtotal - discount + deliveryFee;
    for (const item of rows) {
      if (
        !(await adjustStock(
          tx,
          { productId: item.productId ?? null, variantId: item.variantId ?? null },
          -item.quantity,
        ))
      ) {
        throw new HttpError(`"${item.name}${item.variantName ? ` (${item.variantName})` : ""}" is out of stock`, 409);
      }
    }

    const now = new Date();

    const [order] = await tx
      .insert(orders)
      .values({
        userId: user.id,
        paymentMethod: input.paymentMethod,
        deliveryMethod: input.deliveryMethod,
        address,
        customerName: name,
        customerPhone: phone,
        customerUsername: user.username,
        comment: (input.comment ?? "").trim().slice(0, 500),
        promoCode: promo?.code ?? null,
        subtotal,
        discount,
        deliveryFee,
        total,
        currency: cfg.currencyCode,
        stockDeducted: true,
        stockReservedUntil: stockReservationExpiry(input.paymentMethod, now),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const items = await tx
      .insert(orderItems)
      .values(rows.map((r) => ({ ...r, orderId: order.id })))
      .returning();
    await tx.update(users).set({ phone }).where(eq(users.id, user.id));
    return { order, items };
  });

  // side effects (best-effort)
  await postAdminCard(created.order, created.items, user);
  await notifyBuyer(created.order, user);

  const full = await getOrderFull(created.order.id);
  const order = full?.order ?? created.order;
  const payment = await createPayment(order, created.items, user);
  return { order: toOrderDto(order, created.items, user), payment };
}

export async function createPayment(order: DbOrder, items: DbOrderItem[], user: DbUser) {
  const cfg = await getEffectiveConfig();
  const provider = getProvider(order.paymentMethod, cfg);
  if (!provider) return { type: "none" as const, error: "provider_unavailable" };
  try {
    return await provider.createPayment({ order, items, user });
  } catch (e) {
    console.error("createPayment failed", e);
    return { type: "none" as const, error: "payment_failed" };
  }
}

export async function validateTelegramPreCheckout(orderId: number | null, payment: TelegramPaymentInfo) {
  if (!orderId) return false;
  await releaseExpiredStockReservations();
  const cfg = await getEffectiveConfig();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (
      !order ||
      order.status !== "new" ||
      order.paymentStatus !== "unpaid" ||
      !order.stockDeducted ||
      !order.stockReservedUntil ||
      order.stockReservedUntil <= now
    ) {
      return false;
    }

    const [user] = await tx.select({ tgId: users.tgId }).from(users).where(eq(users.id, order.userId)).limit(1);
    const expected = expectedTelegramPayment(order, cfg.starsPerUnit);
    if (
      !user ||
      user.tgId !== payment.telegramUserId ||
      !expected ||
      expected.currency !== payment.currency ||
      expected.amount !== payment.totalAmount
    ) {
      return false;
    }

    const [updated] = await tx
      .update(orders)
      .set({ stockReservedUntil: new Date(now.getTime() + PAYMENT_COMPLETION_GRACE_MS), updatedAt: now })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.status, "new"),
          eq(orders.paymentStatus, "unpaid"),
          eq(orders.stockDeducted, true),
          gt(orders.stockReservedUntil, now),
        ),
      )
      .returning({ id: orders.id });
    return Boolean(updated);
  });
}

class StockUnavailableError extends Error {}

/** Applies a manager/system action to an order, adjusts stock and sends notifications. */
export async function applyAction(orderId: number, action: OrderAction, telegramPayment?: TelegramPaymentInfo) {
  await releaseExpiredStockReservations();
  const cfg = telegramPayment ? await getEffectiveConfig() : null;
  let result: ActionResult;
  try {
    result = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!o) return { error: "not_found" as const };
      const now = new Date();
      const set: Partial<typeof orders.$inferInsert> = { updatedAt: now };

      if (telegramPayment) {
        if (action !== "pay" || !cfg) return { error: "invalid_state" as const };
        const [user] = await tx.select({ tgId: users.tgId }).from(users).where(eq(users.id, o.userId)).limit(1);
        const expected = expectedTelegramPayment(o, cfg.starsPerUnit);
        if (
          !user ||
          user.tgId !== telegramPayment.telegramUserId ||
          !expected ||
          expected.currency !== telegramPayment.currency ||
          expected.amount !== telegramPayment.totalAmount
        ) {
          return { error: "payment_mismatch" as const };
        }
      }

      if (action === "pay") {
        if (o.paymentStatus === "paid" || o.status === "cancelled") return { error: "invalid_state" as const };
        if (o.stockDeducted && (!o.stockReservedUntil || o.stockReservedUntil <= now)) {
          const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
          for (const item of items) {
            await adjustStock(tx, item, item.quantity);
          }
          if (o.promoCode) {
            await tx
              .update(promoCodes)
              .set({ used: sql`greatest(${promoCodes.used} - 1, 0)` })
              .where(eq(promoCodes.code, o.promoCode));
          }
          await tx
            .update(orders)
            .set({ status: "cancelled", stockDeducted: false, stockReservedUntil: null, updatedAt: now })
            .where(eq(orders.id, o.id));
          return { error: "reservation_expired" as const };
        }

        if (!o.stockDeducted) {
          const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
          for (const item of items) {
            if (!(await adjustStock(tx, item, -item.quantity))) throw new StockUnavailableError();
          }
          set.stockDeducted = true;
        }
        set.paymentStatus = "paid";
        set.paidAt = now;
        set.stockReservedUntil = null;
        if (o.status === "new") set.status = "paid";
      } else if (action === "processing") {
        if (o.status !== "paid") return { error: "invalid_state" as const };
        set.status = "processing";
      } else if (action === "shipped") {
        if (!["paid", "processing"].includes(o.status)) return { error: "invalid_state" as const };
        set.status = "shipped";
      } else if (action === "completed") {
        if (!["paid", "processing", "shipped"].includes(o.status)) return { error: "invalid_state" as const };
        set.status = "completed";
      } else if (action === "cancel") {
        if (["completed", "cancelled"].includes(o.status)) return { error: "invalid_state" as const };
        set.status = "cancelled";
        set.stockReservedUntil = null;
        if (o.stockDeducted) {
          const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
          for (const item of items) {
            await adjustStock(tx, item, item.quantity);
          }
          set.stockDeducted = false;
        }
        if (o.paymentStatus === "unpaid" && o.promoCode) {
          await tx
            .update(promoCodes)
            .set({ used: sql`greatest(${promoCodes.used} - 1, 0)` })
            .where(eq(promoCodes.code, o.promoCode));
        }
      }
      const [updated] = await tx.update(orders).set(set).where(eq(orders.id, o.id)).returning();
      if (!updated) return { error: "not_found" as const };
      return { order: updated };
    });
  } catch (error) {
    if (error instanceof StockUnavailableError) return { error: "out_of_stock" as const };
    throw error;
  }

  if ("error" in result) return result;

  const full = await getOrderFull(orderId);
  if (full) {
    await refreshAdminCard(full.order, full.items, full.user);
    await notifyBuyer(full.order, full.user);
  }
  return { order: result.order };
}

export async function attachReceipt(orderId: number, fileId: string) {
  await db.update(orders).set({ receiptFileId: fileId, updatedAt: new Date() }).where(eq(orders.id, orderId));
}

export async function findPendingManualOrder(userId: number) {
  await releaseExpiredStockReservations();
  const [o] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.paymentMethod, "manual"),
        eq(orders.paymentStatus, "unpaid"),
        eq(orders.status, "new"),
      ),
    )
    .orderBy(desc(orders.id))
    .limit(1);
  return o ?? null;
}
