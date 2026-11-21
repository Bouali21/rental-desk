import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  customers,
  lineItems,
  orderLines,
  orders,
  payments,
  priceTiers,
  products,
  stockItems,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/db/schema";
import { parseLocal } from "@/lib/format";
import { ACTIVE, assertAvailable, guardStatements, runGuarded } from "./availability";
import { orderTotals, overlaps, unitPrice, type Totals } from "./pricing";
import { refuse } from "./refuse";
import type { Viewer } from "./viewer";

const period = {
  start: z.string().refine((v) => !Number.isNaN(parseLocal(v)), "Pick a pickup time"),
  end: z.string().refine((v) => !Number.isNaN(parseLocal(v)), "Pick a return time"),
};
const laterEnd = (p: { start: string; end: string }) => parseLocal(p.end) > parseLocal(p.start);
const laterEndMessage = "Return must be after pickup";

export const createOrderInput = z
  .object({ customerId: z.string().uuid("Pick a customer"), ...period })
  .strict()
  .refine(laterEnd, laterEndMessage);
export const periodInput = z
  .object({ id: z.string().uuid(), ...period })
  .strict()
  .refine(laterEnd, laterEndMessage);
export const addLineInput = z
  .object({
    orderId: z.string().uuid(),
    productId: z.string().uuid("Pick a product"),
    quantity: z.number().int().min(1, "Quantity must be at least 1").max(10000),
  })
  .strict();
export const lineInput = z
  .object({ lineId: z.string().uuid(), quantity: z.number().int().min(1).max(10000) })
  .strict();
export const removeLineInput = z.object({ lineId: z.string().uuid() }).strict();
export const discountInput = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["none", "percent", "fixed"]),
    value: z.number().int().min(0).max(1e10),
  })
  .strict()
  .refine((d) => d.type !== "percent" || d.value <= 100, "A percentage is at most 100");
export const transitionInput = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["reserve", "approve", "decline", "cancel", "return"]),
  })
  .strict();
export const pickupInput = z
  .object({
    id: z.string().uuid(),
    assignments: z
      .array(z.object({ lineId: z.string().uuid(), stockItemIds: z.array(z.string().uuid()).max(10000) }))
      .max(200),
  })
  .strict();
export const paymentInput = z
  .object({
    orderId: z.string().uuid(),
    kind: z.enum(["payment", "refund"]),
    amountCents: z.number().int().min(1, "Enter an amount").max(1e10),
    method: z.string().trim().max(100),
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    note: z.string().trim().max(1000),
  })
  .strict();
export const deletePaymentInput = z.object({ id: z.string().uuid() }).strict();
export const listOrdersInput = z
  .object({ status: z.enum([...ORDER_STATUSES, "all"]), q: z.string().max(200) })
  .strict();
export const idInput = z.object({ id: z.string().uuid() }).strict();

type OrderRow = typeof orders.$inferSelect;

/** Drafts belong to their creator (and admins); every other order is the team's. */
export function canSee(viewer: Viewer, order: Pick<OrderRow, "status" | "createdBy">) {
  return order.status !== "draft" || order.createdBy === viewer.id || viewer.admin;
}

function visibleWhere(viewer: Viewer): SQL | undefined {
  if (viewer.admin) return undefined;
  return or(ne(orders.status, "draft"), eq(orders.createdBy, viewer.id));
}

async function loadOrder(viewer: Viewer, id: string): Promise<OrderRow> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order || !canSee(viewer, order)) refuse(404, "Order not found");
  return order;
}

const EDITABLE: OrderStatus[] = ["draft", "request", "reserved"];

async function loadEditable(viewer: Viewer, id: string): Promise<OrderRow> {
  const order = await loadOrder(viewer, id);
  if (!EDITABLE.includes(order.status))
    refuse(400, "This order can't be changed any more.");
  return order;
}

export interface PricedLine {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  tracking: "bulk" | "trackable";
  quantity: number;
  unitCents: number;
  lineCents: number;
  depositCents: number;
  items: { id: string; identifier: string }[];
}

/** Every line of the orders, priced from the product's current pricing and the order's period. */
export async function pricedLines(
  list: Pick<OrderRow, "id" | "startsAt" | "endsAt">[],
): Promise<Map<string, PricedLine[]>> {
  const result = new Map<string, PricedLine[]>(list.map((o) => [o.id, []]));
  if (list.length === 0) return result;
  const ids = list.map((o) => o.id);
  const lines = await db
    .select({
      id: orderLines.id,
      orderId: orderLines.orderId,
      productId: orderLines.productId,
      quantity: orderLines.quantity,
      productName: products.name,
      tracking: products.tracking,
      pricingMethod: products.pricingMethod,
      priceCents: products.priceCents,
      depositCents: products.depositCents,
    })
    .from(orderLines)
    .innerJoin(products, eq(products.id, orderLines.productId))
    .where(inArray(orderLines.orderId, ids))
    .orderBy(products.name);
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const [tiers, assigned] = await Promise.all([
    productIds.length
      ? db.select().from(priceTiers).where(inArray(priceTiers.productId, productIds))
      : [],
    db
      .select({
        lineId: lineItems.orderLineId,
        id: stockItems.id,
        identifier: stockItems.identifier,
      })
      .from(lineItems)
      .innerJoin(stockItems, eq(stockItems.id, lineItems.stockItemId))
      .where(inArray(lineItems.orderId, ids))
      .orderBy(stockItems.identifier),
  ]);
  const byId = new Map(list.map((o) => [o.id, o]));
  for (const l of lines) {
    const order = byId.get(l.orderId)!;
    const unitCents = unitPrice(
      {
        pricingMethod: l.pricingMethod,
        priceCents: l.priceCents,
        tiers: tiers.filter((t) => t.productId === l.productId),
      },
      order.startsAt,
      order.endsAt,
    );
    result.get(l.orderId)!.push({
      id: l.id,
      orderId: l.orderId,
      productId: l.productId,
      productName: l.productName,
      tracking: l.tracking,
      quantity: l.quantity,
      unitCents,
      lineCents: unitCents * l.quantity,
      depositCents: l.depositCents * l.quantity,
      items: assigned.filter((a) => a.lineId === l.id).map(({ id, identifier }) => ({ id, identifier })),
    });
  }
  return result;
}

async function paidByOrder(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      orderId: payments.orderId,
      paid: sql<number>`coalesce(sum(case when ${payments.kind} = 'refund' then -${payments.amountCents} else ${payments.amountCents} end), 0)`,
    })
    .from(payments)
    .where(inArray(payments.orderId, ids))
    .groupBy(payments.orderId);
  return new Map(rows.map((r) => [r.orderId, Number(r.paid)]));
}

export async function totalsFor(
  list: OrderRow[],
): Promise<{ lines: Map<string, PricedLine[]>; totals: Map<string, Totals> }> {
  const [lines, paid] = await Promise.all([pricedLines(list), paidByOrder(list.map((o) => o.id))]);
  const totals = new Map<string, Totals>();
  for (const o of list) {
    totals.set(
      o.id,
      orderTotals(
        lines.get(o.id) ?? [],
        { type: o.discountType, value: o.discountValue },
        paid.get(o.id) ?? 0,
      ),
    );
  }
  return { lines, totals };
}

export function isLate(o: Pick<OrderRow, "status" | "endsAt">, now = Date.now()) {
  return o.status === "picked_up" && o.endsAt < now;
}

const listFields = {
  order: orders,
  customerName: customers.name,
};

export async function listOrders(viewer: Viewer, { status, q }: z.infer<typeof listOrdersInput>) {
  const term = q.trim().replace(/^#/, "");
  const rows = await db
    .select(listFields)
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        visibleWhere(viewer),
        status === "all" ? undefined : eq(orders.status, status),
        term
          ? or(
              like(customers.name, `%${term}%`),
              like(customers.email, `%${term}%`),
              /^\d+$/.test(term) ? eq(orders.number, Number(term)) : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(desc(orders.number))
    .limit(200);
  const { totals } = await totalsFor(rows.map((r) => r.order));
  return rows.map(({ order, customerName }) => summary(order, customerName, totals.get(order.id)!));
}

function summary(order: OrderRow, customerName: string, totals: Totals) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    startsAt: order.startsAt,
    endsAt: order.endsAt,
    customerName,
    late: isLate(order),
    totalCents: totals.totalCents,
    dueCents: totals.dueCents,
    paymentStatus: totals.paymentStatus,
  };
}

export async function getOrder(viewer: Viewer, id: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order || !canSee(viewer, order)) return null;
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, order.customerId) });
  const { lines, totals } = await totalsFor([order]);
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, id))
    .orderBy(payments.paidOn, payments.createdAt);
  const { publicToken: _token, ...rest } = order;
  return {
    ...rest,
    late: isLate(order),
    editable: EDITABLE.includes(order.status) && canSee(viewer, order),
    discountEditable: order.status !== "returned" && order.status !== "cancelled",
    deletable: order.status === "draft" && (order.createdBy === viewer.id || viewer.admin),
    fromShop: order.createdBy === null,
    customer: customer!,
    lines: lines.get(id) ?? [],
    totals: totals.get(id)!,
    payments: paymentRows.map(({ createdBy: _c, ...p }) => p),
  };
}

export async function createOrder(viewer: Viewer, input: z.infer<typeof createOrderInput>) {
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, input.customerId) });
  if (!customer || customer.archived) refuse(400, "Pick a customer");
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `insert into orders (id, number, invoice_number, customer_id, status, starts_at, ends_at, created_by)
     values (?1, (select coalesce(max(number), 1000) + 1 from orders),
             (select coalesce(max(invoice_number), 0) + 1 from orders), ?2, 'draft', ?3, ?4, ?5)`,
  )
    .bind(id, input.customerId, parseLocal(input.start), parseLocal(input.end), viewer.id)
    .run();
  return { id };
}

async function quantitiesOf(orderId: string): Promise<Map<string, number>> {
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  const wanted = new Map<string, number>();
  for (const l of lines) wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity);
  return wanted;
}

/** Writes, then (when the order holds stock) the availability guard, in one batch. */
async function write(order: OrderRow, statements: D1PreparedStatement[], holds: boolean, productIds: string[], startsAt = order.startsAt, endsAt = order.endsAt) {
  await runGuarded(holds ? [...statements, ...guardStatements(productIds, startsAt, endsAt)] : statements);
}

export async function updatePeriod(viewer: Viewer, input: z.infer<typeof periodInput>) {
  const order = await loadEditable(viewer, input.id);
  const startsAt = parseLocal(input.start);
  const endsAt = parseLocal(input.end);
  const wanted = await quantitiesOf(order.id);
  await assertAvailable(wanted, startsAt, endsAt, order.id);
  await write(
    order,
    [env.DB.prepare("update orders set starts_at = ?1, ends_at = ?2 where id = ?3").bind(startsAt, endsAt, order.id)],
    order.status === "reserved",
    [...wanted.keys()],
    startsAt,
    endsAt,
  );
}

export async function addLine(viewer: Viewer, input: z.infer<typeof addLineInput>) {
  const order = await loadEditable(viewer, input.orderId);
  const product = await db.query.products.findFirst({ where: eq(products.id, input.productId) });
  if (!product) refuse(400, "Pick a product");
  if (product.archived) refuse(400, `${product.name} is archived and can't be added.`);
  const existing = await db.query.orderLines.findFirst({
    where: and(eq(orderLines.orderId, order.id), eq(orderLines.productId, product.id)),
  });
  const quantity = (existing?.quantity ?? 0) + input.quantity;
  await assertAvailable(new Map([[product.id, quantity]]), order.startsAt, order.endsAt, order.id);
  const statement = existing
    ? env.DB.prepare("update order_lines set quantity = ?1 where id = ?2").bind(quantity, existing.id)
    : env.DB.prepare("insert into order_lines (id, order_id, product_id, quantity) values (?1, ?2, ?3, ?4)").bind(
        crypto.randomUUID(),
        order.id,
        product.id,
        quantity,
      );
  await write(order, [statement], order.status === "reserved", [product.id]);
}

async function loadLine(viewer: Viewer, lineId: string) {
  const line = await db.query.orderLines.findFirst({ where: eq(orderLines.id, lineId) });
  if (!line) refuse(404, "Line not found");
  const order = await loadEditable(viewer, line.orderId);
  return { line, order };
}

export async function updateLine(viewer: Viewer, input: z.infer<typeof lineInput>) {
  const { line, order } = await loadLine(viewer, input.lineId);
  await assertAvailable(new Map([[line.productId, input.quantity]]), order.startsAt, order.endsAt, order.id);
  await write(
    order,
    [env.DB.prepare("update order_lines set quantity = ?1 where id = ?2").bind(input.quantity, line.id)],
    order.status === "reserved",
    [line.productId],
  );
}

export async function removeLine(viewer: Viewer, input: z.infer<typeof removeLineInput>) {
  const { line } = await loadLine(viewer, input.lineId);
  await db.delete(orderLines).where(eq(orderLines.id, line.id));
}

export async function setDiscount(viewer: Viewer, input: z.infer<typeof discountInput>) {
  const order = await loadOrder(viewer, input.id);
  if (order.status === "returned" || order.status === "cancelled")
    refuse(400, "This order can't be changed any more.");
  await db
    .update(orders)
    .set({ discountType: input.type, discountValue: input.type === "none" ? 0 : input.value })
    .where(eq(orders.id, order.id));
}

const TRANSITIONS: Record<z.infer<typeof transitionInput>["action"], { from: OrderStatus[]; to: OrderStatus }> = {
  reserve: { from: ["draft"], to: "reserved" },
  approve: { from: ["request"], to: "reserved" },
  decline: { from: ["request"], to: "cancelled" },
  cancel: { from: ["draft", "request", "reserved"], to: "cancelled" },
  return: { from: ["picked_up"], to: "returned" },
};

export async function transition(viewer: Viewer, input: z.infer<typeof transitionInput>) {
  const order = await loadOrder(viewer, input.id);
  const { from, to } = TRANSITIONS[input.action];
  if (!from.includes(order.status)) refuse(400, "This order can't make that change now.");
  const update = env.DB.prepare("update orders set status = ?1 where id = ?2 and status = ?3").bind(to, order.id, order.status);
  if (to !== "reserved") {
    await env.DB.batch([update]);
    return;
  }
  const wanted = await quantitiesOf(order.id);
  if (wanted.size === 0) refuse(400, "Add at least one product first.");
  await assertAvailable(wanted, order.startsAt, order.endsAt, order.id);
  await write(order, [update], true, [...wanted.keys()]);
}

export async function deleteDraft(viewer: Viewer, id: string) {
  const order = await loadOrder(viewer, id);
  if (order.status !== "draft" || (order.createdBy !== viewer.id && !viewer.admin))
    refuse(403, "Only the person who started a draft can delete it.");
  await db.delete(orders).where(and(eq(orders.id, id), eq(orders.status, "draft")));
}

/** For each trackable line, the stock items free over the order's period. */
export async function pickupOptions(viewer: Viewer, id: string) {
  const order = await loadOrder(viewer, id);
  const lines = (await pricedLines([order])).get(id) ?? [];
  const trackable = lines.filter((l) => l.tracking === "trackable");
  if (trackable.length === 0) return [];
  const productIds = trackable.map((l) => l.productId);
  const [items, busy, buffers] = await Promise.all([
    db
      .select({ id: stockItems.id, productId: stockItems.productId, identifier: stockItems.identifier })
      .from(stockItems)
      .where(and(inArray(stockItems.productId, productIds), eq(stockItems.retired, false)))
      .orderBy(stockItems.identifier),
    db
      .select({ stockItemId: lineItems.stockItemId, startsAt: orders.startsAt, endsAt: orders.endsAt })
      .from(lineItems)
      .innerJoin(orders, eq(orders.id, lineItems.orderId))
      .where(and(inArray(orders.status, [...ACTIVE]), ne(orders.id, id))),
    db
      .select({ id: products.id, bufferMinutes: products.bufferMinutes })
      .from(products)
      .where(inArray(products.id, productIds)),
  ]);
  return trackable.map((line) => {
    const bufferMs = (buffers.find((b) => b.id === line.productId)?.bufferMinutes ?? 0) * 60_000;
    const free = items.filter(
      (item) =>
        item.productId === line.productId &&
        !busy.some((b) => b.stockItemId === item.id && overlaps(b, order, bufferMs)),
    );
    return {
      lineId: line.id,
      productName: line.productName,
      quantity: line.quantity,
      items: free.map(({ id, identifier }) => ({ id, identifier })),
    };
  });
}

export async function pickUp(viewer: Viewer, input: z.infer<typeof pickupInput>) {
  const order = await loadOrder(viewer, input.id);
  if (order.status !== "reserved") refuse(400, "Only reserved orders can be picked up.");
  const options = await pickupOptions(viewer, order.id);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("delete from line_items where order_id = ?1").bind(order.id),
  ];
  const itemIds: string[] = [];
  for (const option of options) {
    const chosen = [...new Set(input.assignments.find((a) => a.lineId === option.lineId)?.stockItemIds ?? [])];
    if (chosen.length !== option.quantity)
      refuse(400, `Pick ${option.quantity} ${option.quantity === 1 ? "item" : "items"} for ${option.productName}.`);
    for (const itemId of chosen) {
      if (!option.items.some((i) => i.id === itemId))
        refuse(400, `An item picked for ${option.productName} is out on another order.`);
      itemIds.push(itemId);
      statements.push(
        env.DB.prepare("insert into line_items (id, order_line_id, order_id, stock_item_id) values (?1, ?2, ?3, ?4)").bind(
          crypto.randomUUID(),
          option.lineId,
          order.id,
          itemId,
        ),
      );
    }
  }
  statements.push(
    env.DB.prepare("update orders set status = 'picked_up' where id = ?1 and status = 'reserved'").bind(order.id),
  );
  await runGuarded([...statements, ...guardStatements([], order.startsAt, order.endsAt, itemIds)]);
}

export async function recordPayment(viewer: Viewer, input: z.infer<typeof paymentInput>) {
  const order = await loadOrder(viewer, input.orderId);
  if (order.status === "draft") refuse(400, "Reserve the order before recording payments.");
  await db.insert(payments).values({
    id: crypto.randomUUID(),
    orderId: order.id,
    kind: input.kind,
    amountCents: input.amountCents,
    method: input.method,
    paidOn: input.paidOn,
    note: input.note,
    createdBy: viewer.id,
  });
}

export async function deletePayment(viewer: Viewer, id: string) {
  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment) refuse(404, "Payment not found");
  await loadOrder(viewer, payment.orderId);
  await db.delete(payments).where(eq(payments.id, id));
}

const DAY = 86_400_000;

/** Today's and the coming week's pickups and returns, and late returns. */
export async function planner(viewer: Viewer) {
  const now = Date.now();
  const todayStart = Math.floor(now / DAY) * DAY;
  const todayEnd = todayStart + DAY;
  const weekEnd = todayStart + 8 * DAY;
  const rows = await db
    .select(listFields)
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        visibleWhere(viewer),
        inArray(orders.status, ["request", "reserved", "picked_up"]),
        sql`(${orders.startsAt} < ${weekEnd} or ${orders.endsAt} < ${weekEnd})`,
      ),
    )
    .orderBy(orders.startsAt);
  const { totals } = await totalsFor(rows.map((r) => r.order));
  const all = rows.map(({ order, customerName }) => summary(order, customerName, totals.get(order.id)!));
  const byEnd = [...all].sort((a, b) => a.endsAt - b.endsAt);
  return {
    requests: all.filter((o) => o.status === "request"),
    late: byEnd.filter((o) => o.late),
    pickupsToday: all.filter((o) => o.status === "reserved" && o.startsAt < todayEnd),
    returnsToday: byEnd.filter((o) => o.status === "picked_up" && !o.late && o.endsAt < todayEnd),
    upcomingPickups: all.filter((o) => o.status === "reserved" && o.startsAt >= todayEnd && o.startsAt < weekEnd),
    upcomingReturns: byEnd.filter(
      (o) => (o.status === "reserved" || o.status === "picked_up") && o.endsAt >= todayEnd && o.endsAt < weekEnd,
    ),
  };
}
