const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export type PricingMethod = "fixed" | "hourly" | "daily" | "weekly" | "tiered";

export interface Pricing {
  pricingMethod: PricingMethod;
  priceCents: number;
  tiers: { days: number; priceCents: number }[];
}

/** The price of one unit rented from `startsAt` to `endsAt`. */
export function unitPrice(p: Pricing, startsAt: number, endsAt: number): number {
  const span = Math.max(0, endsAt - startsAt);
  const hours = Math.max(1, Math.ceil(span / HOUR));
  const days = Math.max(1, Math.ceil(span / DAY));
  const weeks = Math.max(1, Math.ceil(span / WEEK));
  switch (p.pricingMethod) {
    case "fixed":
      return p.priceCents;
    case "hourly":
      return p.priceCents * hours;
    case "daily":
      return p.priceCents * days;
    case "weekly":
      return p.priceCents * weeks;
    case "tiered": {
      const tiers = [...p.tiers].sort((a, b) => a.days - b.days);
      const fits = tiers.find((t) => t.days >= days);
      if (fits) return fits.priceCents;
      const last = tiers.at(-1);
      if (!last) return 0;
      return (
        last.priceCents +
        Math.round(((days - last.days) * last.priceCents) / last.days)
      );
    }
  }
}

export type Discount =
  | { type: "none"; value: number }
  | { type: "percent"; value: number }
  | { type: "fixed"; value: number };

export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "overpaid";

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  depositCents: number;
  totalCents: number;
  paidCents: number;
  dueCents: number;
  paymentStatus: PaymentStatus;
}

export function orderTotals(
  lines: { lineCents: number; depositCents: number }[],
  discount: Discount,
  paidCents: number,
): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const depositCents = lines.reduce((sum, l) => sum + l.depositCents, 0);
  let discountCents = 0;
  if (discount.type === "percent")
    discountCents = Math.round((subtotalCents * Math.min(100, discount.value)) / 100);
  if (discount.type === "fixed")
    discountCents = Math.min(discount.value, subtotalCents);
  const totalCents = subtotalCents - discountCents + depositCents;
  const dueCents = totalCents - paidCents;
  const paymentStatus: PaymentStatus =
    paidCents > totalCents
      ? "overpaid"
      : paidCents === totalCents
        ? "paid"
        : paidCents <= 0
          ? "unpaid"
          : "partially_paid";
  return {
    subtotalCents,
    discountCents,
    depositCents,
    totalCents,
    paidCents,
    dueCents,
    paymentStatus,
  };
}

/** Do two rentals collide, given the buffer kept free around each? */
export function overlaps(
  a: { startsAt: number; endsAt: number },
  b: { startsAt: number; endsAt: number },
  bufferMs: number,
): boolean {
  return a.startsAt < b.endsAt + bufferMs && a.endsAt + bufferMs > b.startsAt;
}
