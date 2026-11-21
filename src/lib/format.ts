/** Times are wall-clock "YYYY-MM-DDTHH:MM" strings, stored as UTC milliseconds. */
export function parseLocal(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return Number.NaN;
  return Date.parse(`${value}:00Z`);
}

export function toLocal(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(ms);
}

export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(ms);
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "12.5" as 1250; NaN when it isn't an amount. */
export function toCents(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed) * 100);
}

export function fromCents(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export const STATUS_LABELS = {
  draft: "Draft",
  request: "Request",
  reserved: "Reserved",
  picked_up: "Picked up",
  returned: "Returned",
  cancelled: "Cancelled",
} as const;

export const PAYMENT_STATUS_LABELS = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  overpaid: "Overpaid",
} as const;

export const METHOD_UNITS = {
  fixed: "per rental",
  hourly: "/ hour",
  daily: "/ day",
  weekly: "/ week",
  tiered: "",
} as const;

export function priceLabel(
  method: keyof typeof METHOD_UNITS,
  priceCents: number,
  tiers: { days: number; priceCents: number }[],
  currency: string,
): string {
  if (method === "tiered") {
    const first = tiers[0];
    return first
      ? `${formatMoney(first.priceCents, currency)} for ${first.days} ${first.days === 1 ? "day" : "days"}`
      : "";
  }
  return `${formatMoney(priceCents, currency)} ${METHOD_UNITS[method]}`;
}
