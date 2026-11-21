import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

/** People the Gateway signed in, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

/** The shop's one row of settings (id = 1). */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  shopName: text("shop_name").notNull(),
  currency: text("currency").notNull(),
  bookingMode: text("booking_mode", { enum: ["instant", "request"] }).notNull(),
  minNoticeHours: integer("min_notice_hours").notNull(),
  contractTerms: text("contract_terms").notNull(),
  invoiceDueDays: integer("invoice_due_days").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageKey: text("image_key"),
  imageType: text("image_type"),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  tracking: text("tracking", { enum: ["bulk", "trackable"] }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  pricingMethod: text("pricing_method", {
    enum: ["fixed", "hourly", "daily", "weekly", "tiered"],
  })
    .notNull()
    .default("daily"),
  priceCents: integer("price_cents").notNull().default(0),
  depositCents: integer("deposit_cents").notNull().default(0),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  createdAt: createdAt(),
});

export const priceTiers = sqliteTable(
  "price_tiers",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    days: integer("days").notNull(),
    priceCents: integer("price_cents").notNull(),
  },
  (t) => [uniqueIndex("price_tiers_product_days").on(t.productId, t.days)],
);

export const stockItems = sqliteTable(
  "stock_items",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    identifier: text("identifier").notNull(),
    retired: integer("retired", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("stock_items_identifier").on(t.productId, t.identifier)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("customers_email").on(t.email)],
);

export const ORDER_STATUSES = [
  "draft",
  "request",
  "reserved",
  "picked_up",
  "returned",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    invoiceNumber: integer("invoice_number").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    status: text("status", { enum: ORDER_STATUSES }).notNull(),
    /** Wall-clock times as milliseconds, read as UTC. */
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at").notNull(),
    discountType: text("discount_type", { enum: ["none", "percent", "fixed"] })
      .notNull()
      .default("none"),
    discountValue: integer("discount_value").notNull().default(0),
    /** Null for bookings from the shop. */
    createdBy: text("created_by"),
    publicToken: text("public_token"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("orders_number").on(t.number),
    uniqueIndex("orders_invoice_number").on(t.invoiceNumber),
    uniqueIndex("orders_public_token").on(t.publicToken),
    index("orders_period").on(t.status, t.startsAt, t.endsAt),
  ],
);

export const orderLines = sqliteTable(
  "order_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_lines_product").on(t.productId)],
);

/** Which stock item went out on which order line. */
export const lineItems = sqliteTable(
  "line_items",
  {
    id: text("id").primaryKey(),
    orderLineId: text("order_line_id")
      .notNull()
      .references(() => orderLines.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    stockItemId: text("stock_item_id")
      .notNull()
      .references(() => stockItems.id),
  },
  (t) => [index("line_items_stock_item").on(t.stockItemId)],
);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["payment", "refund"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull().default(""),
  paidOn: text("paid_on").notNull(),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

/**
 * A write-time guard: a batch inserts `ok = 0` when a check fails, the CHECK
 * constraint rejects it, and D1 rolls the whole batch back.
 */
export const guard = sqliteTable(
  "guard",
  { ok: integer("ok").notNull() },
  (t) => [check("guard_ok", sql`${t.ok} = 1`)],
);
