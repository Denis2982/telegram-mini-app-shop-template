import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  tgId: bigint("tg_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  languageCode: text("language_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: integer("parent_id"),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    price: money("price").notNull(),
    images: text("images").array().default([]).notNull(),
    specs: jsonb("specs").$type<Record<string, string>>().default({}).notNull(),
    stock: integer("stock").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("products_category_idx").on(t.categoryId)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku"),
    /** Absolute price of the variant. NULL = use product price. */
    price: money("price"),
    stock: integer("stock").default(0).notNull(),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  percent: integer("percent"),
  amount: money("amount"),
  active: boolean("active").default(true).notNull(),
  usageLimit: integer("usage_limit"),
  used: integer("used").default(0).notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    /** new | paid | processing | shipped | completed | cancelled */
    status: text("status").default("new").notNull(),
    /** stars | card | manual */
    paymentMethod: text("payment_method").notNull(),
    /** unpaid | paid */
    paymentStatus: text("payment_status").default("unpaid").notNull(),
    /** courier | pickup | post */
    deliveryMethod: text("delivery_method").notNull(),
    address: text("address").default("").notNull(),
    customerName: text("customer_name").default("").notNull(),
    customerPhone: text("customer_phone").default("").notNull(),
    customerUsername: text("customer_username"),
    comment: text("comment").default("").notNull(),
    promoCode: text("promo_code"),
    subtotal: money("subtotal").notNull(),
    discount: money("discount").default(0).notNull(),
    deliveryFee: money("delivery_fee").default(0).notNull(),
    total: money("total").notNull(),
    currency: text("currency").notNull(),
    receiptFileId: text("receipt_file_id"),
    adminMessageId: bigint("admin_message_id", { mode: "number" }),
    stockDeducted: boolean("stock_deducted").default(false).notNull(),
    stockReservedUntil: timestamp("stock_reserved_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    paidAt: timestamp("paid_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("orders_user_idx").on(t.userId)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    sku: text("sku").default("").notNull(),
    name: text("name").notNull(),
    variantName: text("variant_name"),
    image: text("image"),
    price: money("price").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const storeSettings = pgTable("store_settings", {
  key: text("key").primaryKey(),
  manualPaymentDetails: text("manual_payment_details"),
  pickupPoints: text("pickup_points").array(),
  currencyCode: text("currency_code"),
  currencySymbol: text("currency_symbol"),
  courierFee: money("courier_fee"),
  postFee: money("post_fee"),
  freeDeliveryFrom: money("free_delivery_from"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DbUser = typeof users.$inferSelect;
export type DbOrder = typeof orders.$inferSelect;
export type DbOrderItem = typeof orderItems.$inferSelect;
