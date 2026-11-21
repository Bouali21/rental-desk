import { and, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { canSee, isLate, totalsFor } from "./orders";
import type { Viewer } from "./viewer";

const fields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email")]),
  phone: z.string().trim().max(50),
  address: z.string().trim().max(500),
  notes: z.string().trim().max(5000),
};

export const customerInput = z.object(fields).strict();
export const updateCustomerInput = z.object({ id: z.string().uuid(), ...fields }).strict();
export const archiveCustomerInput = z
  .object({ id: z.string().uuid(), archived: z.boolean() })
  .strict();
export const listCustomersInput = z
  .object({ q: z.string().max(200), archived: z.boolean() })
  .strict();

export function listCustomers({ q, archived }: z.infer<typeof listCustomersInput>) {
  const term = q.trim();
  return db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      archived: customers.archived,
    })
    .from(customers)
    .where(
      and(
        eq(customers.archived, archived),
        term
          ? or(
              like(customers.name, `%${term}%`),
              like(customers.email, `%${term}%`),
              like(customers.phone, `%${term}%`),
            )
          : undefined,
      ),
    )
    .orderBy(customers.name)
    .limit(500);
}

/** Customers a new order can be for. */
export function activeCustomers() {
  return db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.archived, false))
    .orderBy(customers.name);
}

const OWED = ["reserved", "picked_up", "returned"] as const;

export async function getCustomer(viewer: Viewer, id: string) {
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!customer) return null;
  const rows = (
    await db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.startsAt))
  ).filter((o) => canSee(viewer, o));
  const { totals } = await totalsFor(rows);
  const balanceCents = rows
    .filter((o) => (OWED as readonly string[]).includes(o.status))
    .reduce((sum, o) => sum + totals.get(o.id)!.dueCents, 0);
  return {
    ...customer,
    balanceCents,
    orders: rows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      late: isLate(o),
      totalCents: totals.get(o.id)!.totalCents,
      dueCents: totals.get(o.id)!.dueCents,
    })),
  };
}

export async function createCustomer(input: z.infer<typeof customerInput>) {
  const id = crypto.randomUUID();
  await db.insert(customers).values({ id, ...input });
  return { id };
}

export async function updateCustomer({ id, ...rest }: z.infer<typeof updateCustomerInput>) {
  await db.update(customers).set(rest).where(eq(customers.id, id));
}

export async function setCustomerArchived({ id, archived }: z.infer<typeof archiveCustomerInput>) {
  await db.update(customers).set({ archived }).where(eq(customers.id, id));
}

