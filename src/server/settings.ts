import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const DEFAULT_SETTINGS = {
  shopName: "Rental shop",
  currency: "USD",
  bookingMode: "instant" as "instant" | "request",
  minNoticeHours: 24,
  contractTerms:
    "The renter returns all items on time, clean and in working order, and pays for loss or damage.",
  invoiceDueDays: 14,
};

export type ShopSettings = typeof DEFAULT_SETTINGS;

export const settingsInput = z
  .object({
    shopName: z.string().trim().min(1, "Shop name is required").max(120),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, such as USD"),
    bookingMode: z.enum(["instant", "request"]),
    minNoticeHours: z.number().int().min(0).max(24 * 365),
    contractTerms: z.string().max(20000),
    invoiceDueDays: z.number().int().min(0).max(365),
  })
  .strict();

export async function getSettings(): Promise<ShopSettings> {
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  if (!row) return { ...DEFAULT_SETTINGS };
  const { id: _id, ...rest } = row;
  return rest;
}

export async function saveSettings(
  input: z.infer<typeof settingsInput>,
): Promise<ShopSettings> {
  await db
    .insert(settings)
    .values({ id: 1, ...input })
    .onConflictDoUpdate({ target: settings.id, set: input });
  return getSettings();
}
