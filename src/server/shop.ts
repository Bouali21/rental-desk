import { env } from "cloudflare:workers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, orders, priceTiers, products } from "@/db/schema";
import { parseLocal } from "@/lib/format";
import { assertAvailable, freeQuantity, guardStatements, runGuarded, ShortageError, stockInfo } from "./availability";
import { totalsFor } from "./orders";
import { unitPrice } from "./pricing";
import { getSettings } from "./settings";

/** Published products that aren't archived: the only ones the shop shows. */
async function shopProducts(ids?: string[]) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      pricingMethod: products.pricingMethod,
      priceCents: products.priceCents,
      depositCents: products.depositCents,
      hasImage: sql<number>`${products.imageKey} is not null`,
    })
    .from(products)
    .where(
      and(
        eq(products.published, true),
        eq(products.archived, false),
        ids ? inArray(products.id, ids) : undefined,
      ),
    )
    .orderBy(products.name);
  const tiers = rows.length
    ? await db
        .select()
        .from(priceTiers)
        .where(inArray(priceTiers.productId, rows.map((r) => r.id)))
        .orderBy(priceTiers.days)
    : [];
  return rows.map((r) => ({
    ...r,
    hasImage: Boolean(r.hasImage),
    tiers: tiers.filter((t) => t.productId === r.id).map(({ days, priceCents }) => ({ days, priceCents })),
  }));
}

export async function catalog(start: string | null, end: string | null) {
  const settings = await getSettings();
  const list = await shopProducts();
  const startsAt = start ? parseLocal(start) : Number.NaN;
  const endsAt = end ? parseLocal(end) : Number.NaN;
  const dated = !Number.isNaN(startsAt) && !Number.isNaN(endsAt) && endsAt > startsAt;
  const infos = dated ? await stockInfo(list.map((p) => p.id)) : new Map();
  return {
    shop: {
      name: settings.shopName,
      currency: settings.currency,
      bookingMode: settings.bookingMode,
      minNoticeHours: settings.minNoticeHours,
    },
    products: await Promise.all(
      list.map(async (p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.hasImage ? `/shop/img/${p.id}` : null,
        pricingMethod: p.pricingMethod,
        priceCents: p.priceCents,
        depositCents: p.depositCents,
        tiers: p.tiers,
        periodPriceCents: dated ? unitPrice(p, startsAt, endsAt) : null,
        available: dated ? await freeQuantity(infos.get(p.id)!, startsAt, endsAt) : null,
      })),
    ),
  };
}

export const bookingInput = z
  .object({
    start: z.string(),
    end: z.string(),
    name: z.string().trim().min(1, "Enter your name").max(200),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    phone: z.string().trim().min(1, "Enter your phone number").max(50),
    items: z
      .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(1000) }))
      .min(1, "Add at least one product")
      .max(50),
  })
  .strict();

export class BookingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function book(raw: unknown) {
  const parsed = bookingInput.safeParse(raw);
  if (!parsed.success) throw new BookingError(parsed.error.issues[0]?.message ?? "Check the form", 400);
  const input = parsed.data;
  const startsAt = parseLocal(input.start);
  const endsAt = parseLocal(input.end);
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) throw new BookingError("Pick pickup and return times", 400);
  if (endsAt <= startsAt) throw new BookingError("Return must be after pickup", 400);
  const settings = await getSettings();
  if (startsAt < Date.now() + settings.minNoticeHours * 3_600_000)
    throw new BookingError(`Bookings need at least ${settings.minNoticeHours} hours' notice.`, 400);

  const wanted = new Map<string, number>();
  for (const item of input.items) wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.quantity);
  const offered = await shopProducts([...wanted.keys()]);
  if (offered.length !== wanted.size) throw new BookingError("A product in the booking isn't available online.", 400);
  try {
    await assertAvailable(wanted, startsAt, endsAt);
  } catch (error) {
    if (error instanceof ShortageError) throw new BookingError(error.message, 409);
    throw error;
  }

  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.email, input.email), eq(customers.archived, false)),
  });
  const customerId = existing?.id ?? crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const status = settings.bookingMode === "instant" ? "reserved" : "request";
  const statements: D1PreparedStatement[] = [];
  if (!existing) {
    statements.push(
      env.DB.prepare("insert into customers (id, name, email, phone) values (?1, ?2, ?3, ?4)").bind(
        customerId,
        input.name,
        input.email,
        input.phone,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      `insert into orders (id, number, invoice_number, customer_id, status, starts_at, ends_at, created_by, public_token)
       values (?1, (select coalesce(max(number), 1000) + 1 from orders),
               (select coalesce(max(invoice_number), 0) + 1 from orders), ?2, ?3, ?4, ?5, null, ?6)`,
    ).bind(orderId, customerId, status, startsAt, endsAt, token),
  );
  for (const [productId, quantity] of wanted) {
    statements.push(
      env.DB.prepare("insert into order_lines (id, order_id, product_id, quantity) values (?1, ?2, ?3, ?4)").bind(
        crypto.randomUUID(),
        orderId,
        productId,
        quantity,
      ),
    );
  }
  try {
    await runGuarded(status === "reserved" ? [...statements, ...guardStatements([...wanted.keys()], startsAt, endsAt)] : statements);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Not enough")) throw new BookingError(error.message, 409);
    throw error;
  }
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  return { token, reference: `#${order!.number}`, status };
}

/** A booking's confirmation, by its token: what was booked, never who. */
export async function booking(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const order = await db.query.orders.findFirst({ where: eq(orders.publicToken, token) });
  if (!order) return null;
  const settings = await getSettings();
  const { lines, totals } = await totalsFor([order]);
  const t = totals.get(order.id)!;
  return {
    shopName: settings.shopName,
    currency: settings.currency,
    reference: `#${order.number}`,
    status: order.status,
    startsAt: order.startsAt,
    endsAt: order.endsAt,
    items: (lines.get(order.id) ?? []).map((l) => ({
      name: l.productName,
      quantity: l.quantity,
      lineCents: l.lineCents,
    })),
    subtotalCents: t.subtotalCents,
    discountCents: t.discountCents,
    depositCents: t.depositCents,
    totalCents: t.totalCents,
  };
}
