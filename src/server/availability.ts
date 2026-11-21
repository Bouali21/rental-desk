import { env } from "cloudflare:workers";
import { setResponseStatus } from "@tanstack/react-start/server";
import { and, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderLines, orders, products } from "@/db/schema";

const MINUTE = 60_000;
export const ACTIVE = ["reserved", "picked_up"] as const;

export interface StockInfo {
  id: string;
  name: string;
  stock: number;
  bufferMs: number;
}

/** Each product's stock: its quantity, or its items that aren't retired. */
export async function stockInfo(productIds: string[]): Promise<Map<string, StockInfo>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      tracking: products.tracking,
      quantity: products.quantity,
      bufferMinutes: products.bufferMinutes,
      items: sql<number>`(select count(*) from stock_items s where s.product_id = "products"."id" and s.retired = 0)`,
    })
    .from(products)
    .where(inArray(products.id, productIds));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        stock: r.tracking === "bulk" ? r.quantity : Number(r.items),
        bufferMs: r.bufferMinutes * MINUTE,
      },
    ]),
  );
}

/** Units of a product held by active orders overlapping the period widened by its buffer. */
export async function heldQuantity(
  productId: string,
  startsAt: number,
  endsAt: number,
  bufferMs: number,
  excludeOrderId?: string,
): Promise<number> {
  const [row] = await db
    .select({ held: sql<number>`coalesce(sum(${orderLines.quantity}), 0)` })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.productId, productId),
        inArray(orders.status, [...ACTIVE]),
        lt(orders.startsAt, endsAt + bufferMs),
        gt(sql`${orders.endsAt} + ${bufferMs}`, startsAt),
        excludeOrderId ? ne(orders.id, excludeOrderId) : undefined,
      ),
    );
  return Number(row?.held ?? 0);
}

export async function freeQuantity(
  info: StockInfo,
  startsAt: number,
  endsAt: number,
  excludeOrderId?: string,
): Promise<number> {
  const held = await heldQuantity(info.id, startsAt, endsAt, info.bufferMs, excludeOrderId);
  return Math.max(0, info.stock - held);
}

/** Throws a message naming every product that is short, or returns. */
export async function assertAvailable(
  wanted: Map<string, number>,
  startsAt: number,
  endsAt: number,
  excludeOrderId?: string,
): Promise<void> {
  const infos = await stockInfo([...wanted.keys()]);
  const short: string[] = [];
  for (const [productId, quantity] of wanted) {
    if (quantity <= 0) continue;
    const info = infos.get(productId);
    if (!info) continue;
    const free = await freeQuantity(info, startsAt, endsAt, excludeOrderId);
    if (quantity > free) short.push(`${info.name} (${quantity} requested, ${free} free)`);
  }
  if (short.length > 0) {
    try {
      setResponseStatus(409);
    } catch {
      // not inside a server function
    }
    throw new ShortageError(short);
  }
}

export class ShortageError extends Error {
  constructor(public readonly short: string[]) {
    super(`Not enough available: ${short.join("; ")}`);
  }
}

/**
 * Statements for the end of a write batch: each fails (rolling the batch
 * back) when an active order now holds more of a product than its stock,
 * or puts a stock item on two overlapping orders.
 */
export function guardStatements(
  productIds: string[],
  startsAt: number,
  endsAt: number,
  stockItemIds: string[] = [],
): D1PreparedStatement[] {
  const statements = [...new Set(productIds)].map((id) =>
    env.DB.prepare(
      `insert into guard (ok) select case when
        (select case p.tracking when 'bulk' then p.quantity
           else (select count(*) from stock_items s where s.product_id = p.id and s.retired = 0) end
         from products p where p.id = ?1)
        >= (select coalesce(sum(l.quantity), 0) from order_lines l join orders o on o.id = l.order_id
            join products p on p.id = l.product_id
            where l.product_id = ?1 and o.status in ('reserved', 'picked_up')
              and o.starts_at < ?3 + p.buffer_minutes * 60000
              and o.ends_at + p.buffer_minutes * 60000 > ?2)
       then 1 else 0 end`,
    ).bind(id, startsAt, endsAt),
  );
  for (const itemId of new Set(stockItemIds)) {
    statements.push(
      env.DB.prepare(
        `insert into guard (ok) select case when
          (select count(*) from line_items li join orders o on o.id = li.order_id
             join stock_items s on s.id = li.stock_item_id
             join products p on p.id = s.product_id
           where li.stock_item_id = ?1 and o.status in ('reserved', 'picked_up')
             and o.starts_at < ?3 + p.buffer_minutes * 60000
             and o.ends_at + p.buffer_minutes * 60000 > ?2) <= 1
         then 1 else 0 end`,
      ).bind(itemId, startsAt, endsAt),
    );
  }
  statements.push(env.DB.prepare("delete from guard"));
  return statements;
}

/** Runs a write batch; a failed guard becomes a readable refusal. */
export async function runGuarded(statements: D1PreparedStatement[]): Promise<void> {
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).includes("guard_ok")) {
      try {
        setResponseStatus(409);
      } catch {
        // not inside a server function
      }
      throw new Error(
        "Not enough available: another booking just took the stock. Check availability and try again.",
      );
    }
    throw error;
  }
}

export interface DayAvailability {
  products: { id: string; name: string; stock: number; free: Record<string, number> }[];
  days: string[];
}

const DAY = 24 * 60 * MINUTE;

/** Free quantity of every product that isn't archived, for each day in the range. */
export async function availabilityGrid(from: number, to: number): Promise<DayAvailability> {
  const days: string[] = [];
  for (let t = from; t <= to && days.length < 31; t += DAY) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const list = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.archived, false))
    .orderBy(products.name);
  const infos = await stockInfo(list.map((p) => p.id));
  const lines = await db
    .select({
      productId: orderLines.productId,
      quantity: orderLines.quantity,
      startsAt: orders.startsAt,
      endsAt: orders.endsAt,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        inArray(orders.status, [...ACTIVE]),
        lt(orders.startsAt, to + 2 * DAY),
        gt(orders.endsAt, from - 2 * DAY),
      ),
    );
  return {
    days,
    products: list.map(({ id }) => {
      const info = infos.get(id)!;
      const free: Record<string, number> = {};
      for (const d of days) {
        const start = Date.parse(`${d}T00:00:00Z`);
        const end = start + DAY;
        const held = lines
          .filter(
            (l) =>
              l.productId === id &&
              l.startsAt < end + info.bufferMs &&
              l.endsAt + info.bufferMs > start,
          )
          .reduce((sum, l) => sum + l.quantity, 0);
        free[d] = Math.max(0, info.stock - held);
      }
      return { id, name: info.name, stock: info.stock, free };
    }),
  };
}
