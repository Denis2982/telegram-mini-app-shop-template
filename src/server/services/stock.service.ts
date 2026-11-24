import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, productVariants, products, promoCodes } from "@/db/schema";

type StockTransaction = Pick<typeof db, "select" | "update">;

const RESERVATION_DURATION_MS: Record<string, number> = {
  card: 15 * 60 * 1000,
  stars: 15 * 60 * 1000,
  manual: 24 * 60 * 60 * 1000,
};

export const PAYMENT_COMPLETION_GRACE_MS = 5 * 60 * 1000;

export function stockReservationExpiry(paymentMethod: string, now = new Date()) {
  const duration = RESERVATION_DURATION_MS[paymentMethod];
  if (!duration) throw new Error(`Unsupported payment method for stock reservation: ${paymentMethod}`);
  return new Date(now.getTime() + duration);
}

export async function adjustStock(
  tx: StockTransaction,
  item: { productId: number | null; variantId: number | null },
  delta: number,
) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("Stock adjustment must be a non-zero integer");

  if (item.variantId !== null) {
    const condition =
      delta < 0
        ? and(eq(productVariants.id, item.variantId), gte(productVariants.stock, -delta))
        : eq(productVariants.id, item.variantId);
    const updated = await tx
      .update(productVariants)
      .set({ stock: sql`${productVariants.stock} + ${delta}` })
      .where(condition)
      .returning({ id: productVariants.id });
    return updated.length > 0;
  }

  if (item.productId !== null) {
    const condition =
      delta < 0
        ? and(eq(products.id, item.productId), gte(products.stock, -delta))
        : eq(products.id, item.productId);
    const updated = await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${delta}`, updatedAt: new Date() })
      .where(condition)
      .returning({ id: products.id });
    return updated.length > 0;
  }

  return false;
}

export async function releaseExpiredStockReservations(now = new Date()) {
  return db.transaction(async (tx) => {
    const expiredOrders = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, "new"),
          eq(orders.paymentStatus, "unpaid"),
          eq(orders.stockDeducted, true),
          lte(orders.stockReservedUntil, now),
        ),
      )
      .for("update");

    for (const order of expiredOrders) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const item of items) {
        const restored = await adjustStock(tx, item, item.quantity);
        if (!restored && (item.productId !== null || item.variantId !== null)) {
          console.error("Could not restore reserved stock for expired order", { orderId: order.id, itemId: item.id });
        }
      }

      if (order.promoCode) {
        await tx
          .update(promoCodes)
          .set({ used: sql`greatest(${promoCodes.used} - 1, 0)` })
          .where(eq(promoCodes.code, order.promoCode));
      }

      await tx
        .update(orders)
        .set({ status: "cancelled", stockDeducted: false, stockReservedUntil: null, updatedAt: now })
        .where(eq(orders.id, order.id));
    }

    return expiredOrders.length;
  });
}
