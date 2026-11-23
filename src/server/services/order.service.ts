import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import { adjustStock } from "./product.service";
import { getProvider } from "./payment";
import { getEffectiveConfig } from "./store-settings.service";

export type OrderAction = "pay" | "processing" | "shipped" | "completed" | "cancel";

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
  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.id)).limit(limit);
  return withItems(rows);
}

export async function listAllOrders(limit?: number) {
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

/** Applies a manager/system action to an order, adjusts stock and sends notifications. */
export async function applyAction(orderId: number, action: OrderAction) {
  const result = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) return { error: "not_found" as const };
    const set: Partial<typeof orders.$inferInsert> = { updatedAt: new Date() };

    if (action === "pay") {
      if (o.paymentStatus === "paid" || o.status === "cancelled") return { error: "invalid_state" as const };
      set.paymentStatus = "paid";
      set.paidAt = new Date();
      if (o.status === "new") set.status = "paid";
      if (!o.stockDeducted) {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
        for (const it of items) await adjustStock(tx, it, -it.quantity);
        set.stockDeducted = true;
      }
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
      if (o.stockDeducted) {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
        for (const it of items) await adjustStock(tx, it, it.quantity);
        set.stockDeducted = false;
      }
    }
    const [updated] = await tx.update(orders).set(set).where(eq(orders.id, o.id)).returning();
    return { order: updated };
  });

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
