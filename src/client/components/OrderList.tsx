import { Link } from "@tanstack/react-router";
import { LateBadge, StatusBadge } from "@/client/components/StatusBadge";
import { formatDateTime, formatMoney, STATUS_LABELS } from "@/lib/format";

export interface OrderSummary {
  id: string;
  number: number;
  status: keyof typeof STATUS_LABELS;
  startsAt: number;
  endsAt: number;
  customerName: string;
  late: boolean;
  totalCents: number;
}

/** Orders as a list of rows linking to each order. */
export function OrderList({
  orders,
  currency,
  when,
  testId = "order-row",
}: {
  orders: OrderSummary[];
  currency: string;
  /** Which time to lead with. */
  when: "pickup" | "return" | "period";
  testId?: string;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {orders.map((o) => (
        <li key={o.id} data-testid={testId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
          <Link
            to="/orders/$orderId"
            params={{ orderId: o.id }}
            className="font-medium hover:underline"
          >
            #{o.number} · {o.customerName}
          </Link>
          <StatusBadge status={o.status} />
          {o.late ? <LateBadge /> : null}
          <span className="text-muted-foreground">
            {when === "pickup"
              ? formatDateTime(o.startsAt)
              : when === "return"
                ? formatDateTime(o.endsAt)
                : `${formatDateTime(o.startsAt)} – ${formatDateTime(o.endsAt)}`}
          </span>
          <span className="ml-auto tabular-nums">{formatMoney(o.totalCents, currency)}</span>
        </li>
      ))}
    </ul>
  );
}
