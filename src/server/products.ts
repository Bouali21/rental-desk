import { env } from "cloudflare:workers";
import { and, asc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  customers,
  orderLines,
  orders,
  priceTiers,
  products,
  stockItems,
} from "@/db/schema";
import { stockInfo } from "./availability";
import { refuse } from "./refuse";

export const createProductInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(5000),
    tracking: z.enum(["bulk", "trackable"]),
  })
  .strict();

export const productDetailsInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(5000),
    published: z.boolean(),
  })
  .strict();

export const pricingInput = z
  .object({
    id: z.string().uuid(),
    pricingMethod: z.enum(["fixed", "hourly", "daily", "weekly", "tiered"]),
    priceCents: z.number().int().min(0).max(1e10),
    depositCents: z.number().int().min(0).max(1e10),
    bufferMinutes: z.number().int().min(0).max(2880),
    tiers: z
      .array(
        z.object({
          days: z.number().int().min(1).max(3650),
          priceCents: z.number().int().min(0).max(1e10),
        }),
      )
      .max(20),
  })
  .strict()
  .refine(
    (p) => p.pricingMethod !== "tiered" || p.tiers.length > 0,
    "Add at least one tier",
  )
  .refine(
    (p) => new Set(p.tiers.map((t) => t.days)).size === p.tiers.length,
    "Each tier needs a different number of days",
  );

export const quantityInput = z
  .object({ id: z.string().uuid(), quantity: z.number().int().min(0).max(1e6) })
  .strict();
export const addItemInput = z
  .object({
    productId: z.string().uuid(),
    identifier: z.string().trim().min(1, "Identifier is required").max(100),
  })
  .strict();
export const itemInput = z
  .object({ id: z.string().uuid(), retired: z.boolean() })
  .strict();
export const archiveInput = z
  .object({ id: z.string().uuid(), archived: z.boolean() })
  .strict();
export const idInput = z.object({ id: z.string().uuid() }).strict();

export async function listProducts(q: string) {
  const term = q.trim();
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      tracking: products.tracking,
      published: products.published,
      archived: products.archived,
      pricingMethod: products.pricingMethod,
      priceCents: products.priceCents,
      hasImage: sql<boolean>`${products.imageKey} is not null`,
    })
    .from(products)
    .where(
      term
        ? or(
            like(products.name, `%${term}%`),
            like(products.description, `%${term}%`),
          )
        : undefined,
    )
    .orderBy(products.archived, asc(products.name));
  const infos = await stockInfo(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, stock: infos.get(r.id)?.stock ?? 0 }));
}

export async function getProduct(id: string) {
  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) return null;
  const [tiers, items, bookings, infos] = await Promise.all([
    db
      .select({ days: priceTiers.days, priceCents: priceTiers.priceCents })
      .from(priceTiers)
      .where(eq(priceTiers.productId, id))
      .orderBy(priceTiers.days),
    db
      .select({
        id: stockItems.id,
        identifier: stockItems.identifier,
        retired: stockItems.retired,
      })
      .from(stockItems)
      .where(eq(stockItems.productId, id))
      .orderBy(stockItems.retired, stockItems.identifier),
    db
      .select({
        orderId: orders.id,
        number: orders.number,
        status: orders.status,
        startsAt: orders.startsAt,
        endsAt: orders.endsAt,
        quantity: orderLines.quantity,
        customer: customers.name,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(
        and(
          eq(orderLines.productId, id),
          inArray(orders.status, ["request", "reserved", "picked_up"]),
          gte(orders.endsAt, Date.now()),
        ),
      )
      .orderBy(orders.startsAt)
      .limit(50),
    stockInfo([id]),
  ]);
  const { imageKey, ...rest } = product;
  return {
    ...rest,
    imageVersion: imageKey ? imageKey.split("/").pop()! : null,
    stock: infos.get(id)?.stock ?? 0,
    tiers,
    items,
    bookings,
  };
}

export async function createProduct(input: z.infer<typeof createProductInput>) {
  const id = crypto.randomUUID();
  await db.insert(products).values({ id, ...input });
  return { id };
}

export async function updateDetails({ id, ...rest }: z.infer<typeof productDetailsInput>) {
  await db.update(products).set(rest).where(eq(products.id, id));
}

export async function updatePricing({ id, tiers, ...rest }: z.infer<typeof pricingInput>) {
  const kept = rest.pricingMethod === "tiered" ? tiers : [];
  await db.batch([
    db.update(products).set(rest).where(eq(products.id, id)),
    db.delete(priceTiers).where(eq(priceTiers.productId, id)),
    ...kept.map((t) =>
      db.insert(priceTiers).values({ id: crypto.randomUUID(), productId: id, ...t }),
    ),
  ]);
}

export async function setQuantity({ id, quantity }: z.infer<typeof quantityInput>) {
  await db
    .update(products)
    .set({ quantity })
    .where(and(eq(products.id, id), eq(products.tracking, "bulk")));
}

export async function addItem({ productId, identifier }: z.infer<typeof addItemInput>) {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product || product.tracking !== "trackable")
    refuse(400, "Only trackable products have stock items.");
  const existing = await db.query.stockItems.findFirst({
    where: and(eq(stockItems.productId, productId), eq(stockItems.identifier, identifier)),
  });
  if (existing) refuse(400, `${identifier} is already in stock.`);
  await db.insert(stockItems).values({ id: crypto.randomUUID(), productId, identifier });
}

export async function setItemRetired({ id, retired }: z.infer<typeof itemInput>) {
  await db.update(stockItems).set({ retired }).where(eq(stockItems.id, id));
}

export async function setArchived({ id, archived }: z.infer<typeof archiveInput>) {
  await db.update(products).set({ archived }).where(eq(products.id, id));
}

/** Products a new order line can use. */
export function orderableProducts() {
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.archived, false))
    .orderBy(products.name);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function saveImage(id: string, request: Request): Promise<Response> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^image\/(png|jpeg|webp|gif)$/.test(type))
    return Response.json({ error: "Use a PNG, JPEG, WebP or GIF image." }, { status: 415 });
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_IMAGE_BYTES)
    return Response.json({ error: "Images can be up to 5 MB." }, { status: 413 });
  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) return Response.json({ error: "Not found" }, { status: 404 });
  const key = `products/${id}/${crypto.randomUUID()}`;
  await env.files.put(key, body, { httpMetadata: { contentType: type } });
  await db
    .update(products)
    .set({ imageKey: key, imageType: type })
    .where(eq(products.id, id));
  if (product.imageKey) await env.files.delete(product.imageKey);
  return Response.json({ ok: true });
}

/** The product's image; when `publicOnly`, only for a product on the shop. */
export async function readImage(id: string, publicOnly: boolean): Promise<Response> {
  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product?.imageKey || (publicOnly && (!product.published || product.archived)))
    return new Response("Not found", { status: 404 });
  const object = await env.files.get(product.imageKey);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": product.imageType ?? "application/octet-stream",
      "cache-control": publicOnly ? "public, max-age=300" : "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

