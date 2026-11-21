import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { ShopFrame } from "@/client/components/ShopFrame";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Spinner } from "@/client/components/ui/spinner";
import { formatMoney, priceLabel } from "@/lib/format";

export const Route = createFileRoute("/shop/")({
  head: () => ({ meta: [{ title: "Book online" }] }),
  component: ShopPage,
});

interface Catalog {
  shop: { name: string; currency: string; bookingMode: "instant" | "request"; minNoticeHours: number };
  products: {
    id: string;
    name: string;
    description: string;
    imageUrl: string | null;
    pricingMethod: "fixed" | "hourly" | "daily" | "weekly" | "tiered";
    priceCents: number;
    depositCents: number;
    tiers: { days: number; priceCents: number }[];
    periodPriceCents: number | null;
    available: number | null;
  }[];
}

function ShopPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dates, setDates] = useState<{ start: string; end: string } | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<Record<string, number>>({});
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async (period: { start: string; end: string } | null) => {
    const query = period ? `?start=${encodeURIComponent(period.start)}&end=${encodeURIComponent(period.end)}` : "";
    try {
      const res = await fetch(`/shop/api/catalog${query}`);
      if (!res.ok) throw new Error();
      setCatalog((await res.json()) as Catalog);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  function check(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!start || !end || end <= start) {
      setError("Pick a pickup time and a later return time.");
      return;
    }
    setDates({ start, end });
    void load({ start, end });
  }

  async function book(e: FormEvent) {
    e.preventDefault();
    if (!dates) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/shop/api/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...dates,
          ...guest,
          items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
        }),
      });
      const body = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !body.token) {
        setError(body.error ?? "The booking didn't go through. Try again.");
        if (res.status === 409) void load(dates);
        return;
      }
      await navigate({ to: "/shop/booking/$token", params: { token: body.token } });
    } catch {
      setError("The booking didn't go through. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (loadError && !catalog) {
    return (
      <ShopFrame>
        <Alert variant="destructive">
          <AlertDescription>The shop couldn't be loaded. Refresh to try again.</AlertDescription>
        </Alert>
      </ShopFrame>
    );
  }
  if (!catalog) {
    return (
      <ShopFrame>
        <Spinner />
      </ShopFrame>
    );
  }
  const money = (cents: number) => formatMoney(cents, catalog.shop.currency);
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const cartLines = Object.entries(cart)
    .map(([id, quantity]) => ({ product: byId.get(id), quantity }))
    .filter((l): l is { product: Catalog["products"][number]; quantity: number } => Boolean(l.product));
  const rental = cartLines.reduce((sum, l) => sum + (l.product.periodPriceCents ?? 0) * l.quantity, 0);
  const deposit = cartLines.reduce((sum, l) => sum + l.product.depositCents * l.quantity, 0);

  return (
    <ShopFrame>
      <PageHeader
        title={catalog.shop.name}
        description={
          catalog.shop.minNoticeHours > 0 ? `Book at least ${catalog.shop.minNoticeHours} hours ahead.` : undefined
        }
      />
      <form onSubmit={check} className="flex flex-wrap items-end gap-3">
        <Field id="shop-start" label="Pickup">
          <Input id="shop-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field id="shop-end" label="Return">
          <Input id="shop-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Button type="submit">Check availability</Button>
      </form>

      {catalog.products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is available to book online right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {catalog.products.map((p) => {
            const inCart = cart[p.id] ?? 0;
            const left = p.available === null ? null : p.available - inCart;
            return (
              <Card key={p.id} data-testid="shop-product">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="aspect-video w-full object-cover" />
                ) : null}
                <CardContent className="space-y-3">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {priceLabel(p.pricingMethod, p.priceCents, p.tiers, catalog.shop.currency)}
                      {p.depositCents > 0 ? ` · ${money(p.depositCents)} deposit` : ""}
                    </div>
                  </div>
                  {p.description ? <p className="text-sm">{p.description}</p> : null}
                  {p.available !== null ? (
                    <div className="flex items-center justify-between text-sm">
                      <span data-testid="shop-available" className={p.available === 0 ? "text-destructive" : ""}>
                        {p.available === 0 ? "Not available" : `${p.available} available`}
                      </span>
                      {p.periodPriceCents !== null ? <span>{money(p.periodPriceCents)} each</span> : null}
                    </div>
                  ) : null}
                  {dates && left !== null && left > 0 ? (
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={left}
                        aria-label={`Quantity for ${p.name}`}
                        className="w-20"
                        value={quantities[p.id] ?? "1"}
                        onChange={(e) => setQuantities({ ...quantities, [p.id]: e.target.value })}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          const n = Math.max(1, Math.min(left, Number(quantities[p.id] ?? "1") || 1));
                          setCart({ ...cart, [p.id]: inCart + n });
                          setQuantities({ ...quantities, [p.id]: "1" });
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {dates && cartLines.length > 0 ? (
        <form onSubmit={book} className="space-y-6">
          <section data-testid="shop-cart" className="space-y-3">
            <h2 className="text-sm font-medium">Your booking</h2>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {cartLines.map((l) => (
                <li key={l.product.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1">
                    {l.product.name} × {l.quantity}
                  </span>
                  <span className="tabular-nums">{money((l.product.periodPriceCents ?? 0) * l.quantity)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = { ...cart };
                      delete next[l.product.id];
                      setCart(next);
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <dl className="ml-auto max-w-xs space-y-1 text-sm">
              {deposit > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Deposit</dt>
                  <dd className="tabular-nums">{money(deposit)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(rental + deposit)}</dd>
              </div>
            </dl>
          </section>
          <section className="space-y-4">
            <h2 className="text-sm font-medium">Your details</h2>
            <Field id="guest-name" label="Name">
              <Input id="guest-name" autoComplete="name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="guest-email" label="Email">
                <Input id="guest-email" type="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
              </Field>
              <Field id="guest-phone" label="Phone">
                <Input id="guest-phone" type="tel" autoComplete="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              </Field>
            </div>
          </section>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending}>
            {catalog.shop.bookingMode === "instant" ? "Book now" : "Send request"}
          </Button>
        </form>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </ShopFrame>
  );
}
