import { describe, expect, it } from "vitest";
import { orderTotals, overlaps, unitPrice } from "./pricing";

const H = 3_600_000;
const D = 24 * H;

describe("unitPrice", () => {
  it("charges fixed, hourly, daily and weekly rates by started period", () => {
    const base = { priceCents: 1000, tiers: [] };
    expect(unitPrice({ ...base, pricingMethod: "fixed" }, 0, 5 * D)).toBe(1000);
    expect(unitPrice({ ...base, pricingMethod: "hourly" }, 0, 2.5 * H)).toBe(3000);
    expect(unitPrice({ ...base, pricingMethod: "daily" }, 0, 3 * D)).toBe(3000);
    expect(unitPrice({ ...base, pricingMethod: "daily" }, 0, 3 * D + H)).toBe(4000);
    expect(unitPrice({ ...base, pricingMethod: "weekly" }, 0, 8 * D)).toBe(2000);
  });

  it("uses the first tier that covers the period and extends past the last", () => {
    const p = {
      pricingMethod: "tiered" as const,
      priceCents: 0,
      tiers: [
        { days: 7, priceCents: 40000 },
        { days: 1, priceCents: 8000 },
        { days: 3, priceCents: 20000 },
      ],
    };
    expect(unitPrice(p, 0, D)).toBe(8000);
    expect(unitPrice(p, 0, 2 * D)).toBe(20000);
    expect(unitPrice(p, 0, 3 * D)).toBe(20000);
    expect(unitPrice(p, 0, 5 * D)).toBe(40000);
    expect(unitPrice(p, 0, 14 * D)).toBe(80000);
  });
});

describe("orderTotals", () => {
  const lines = [
    { lineCents: 20000, depositCents: 25000 },
    { lineCents: 9000, depositCents: 0 },
  ];
  it("applies a percentage discount and adds deposits", () => {
    const t = orderTotals(lines, { type: "percent", value: 10 }, 0);
    expect(t).toMatchObject({
      subtotalCents: 29000,
      discountCents: 2900,
      depositCents: 25000,
      totalCents: 51100,
      paymentStatus: "unpaid",
    });
  });
  it("tracks payment status", () => {
    expect(orderTotals(lines, { type: "none", value: 0 }, 1000).paymentStatus).toBe("partially_paid");
    expect(orderTotals(lines, { type: "none", value: 0 }, 54000).paymentStatus).toBe("paid");
    expect(orderTotals(lines, { type: "fixed", value: 1000 }, 54000).paymentStatus).toBe("overpaid");
  });
});

describe("overlaps", () => {
  it("widens both rentals by the buffer", () => {
    const a = { startsAt: 0, endsAt: 10 * H };
    expect(overlaps(a, { startsAt: 10 * H, endsAt: 12 * H }, 0)).toBe(false);
    expect(overlaps(a, { startsAt: 10 * H, endsAt: 12 * H }, H)).toBe(true);
    expect(overlaps(a, { startsAt: 11 * H, endsAt: 12 * H }, H)).toBe(false);
  });
});
