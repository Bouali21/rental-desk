import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/client/components/PageHeader";
import { ShopFrame } from "@/client/components/ShopFrame";
import { Spinner } from "@/client/components/ui/spinner";
import { formatDateTime, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/shop/booking/$token")({
  head: () => ({ meta: [{ title: "Your booking" }] }),
  component: BookingPage,
});

interface Booking {
  shopName: string;
  currency: string;
  reference: string;
  status: string;
  startsAt: number;
  endsAt: number;
  items: { name: string; quantity: number; lineCents: number }[];
  discountCents: number;
  depositCents: number;
  totalCents: number;
}

const HEADINGS: Record<string, string> = {
  request: "Request received",
  cancelled: "Booking cancelled",
};

function BookingPage() {
  const { token } = Route.useParams();
  const [booking, setBooking] = useState<Booking | null | "missing">(null);
  useEffect(() => {
    fetch(`/shop/api/booking/${encodeURIComponent(token)}`)
      .then(async (res) => setBooking(res.ok ? ((await res.json()) as Booking) : "missing"))
      .catch(() => setBooking("missing"));
  }, [token]);
  if (booking === null) {
    return (
      <ShopFrame>
        <Spinner />
      </ShopFrame>
    );
  }
  if (booking === "missing") {
    return (
      <ShopFrame>
        <PageHeader title="Booking not found" />
      </ShopFrame>
    );
  }
  const money = (cents: number) => formatMoney(cents, booking.currency);
  return (
    <ShopFrame>
      <PageHeader
        title={HEADINGS[booking.status] ?? "Booking confirmed"}
        description={
          booking.status === "request"
            ? `${booking.shopName} will confirm your request.`
            : booking.shopName
        }
      />
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Reference</dt>
          <dd data-testid="booking-reference" className="font-medium">
            {booking.reference}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pickup</dt>
          <dd>{formatDateTime(booking.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Return</dt>
          <dd>{formatDateTime(booking.endsAt)}</dd>
        </div>
      </dl>
      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {booking.items.map((item) => (
          <li key={item.name} className="flex justify-between px-4 py-2">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span className="tabular-nums">{money(item.lineCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="ml-auto max-w-xs space-y-1 text-sm">
        {booking.discountCents > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="tabular-nums">−{money(booking.discountCents)}</dd>
          </div>
        ) : null}
        {booking.depositCents > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Deposit</dt>
            <dd className="tabular-nums">{money(booking.depositCents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between font-medium" data-testid="booking-total">
          <dt>Total</dt>
          <dd className="tabular-nums">{money(booking.totalCents)}</dd>
        </div>
      </dl>
    </ShopFrame>
  );
}
