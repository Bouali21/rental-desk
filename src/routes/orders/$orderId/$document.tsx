import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { Button } from "@/client/components/ui/button";
import { Separator } from "@/client/components/ui/separator";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { getOrder } from "@/serverFunctions/orders";

const TITLES = { quote: "Quote", contract: "Rental contract", invoice: "Invoice" } as const;
type Kind = keyof typeof TITLES;

export const Route = createFileRoute("/orders/$orderId/$document")({
  loader: async ({ params }) => {
    if (!(params.document in TITLES)) throw notFound();
    return getOrder({ data: { id: params.orderId } });
  },
  component: DocumentPage,
});

const DAY = 86_400_000;

function DocumentPage() {
  const { order, settings } = Route.useLoaderData();
  const { document } = Route.useParams();
  const kind = document as Kind;
  if (!order) {
    return (
      <Shell>
        <PageHeader title="Order not found" />
      </Shell>
    );
  }
  const money = (cents: number) => formatMoney(cents, settings.currency);
  const issued = Date.parse(`${order.createdAt.replace(" ", "T")}Z`);
  const due = issued + settings.invoiceDueDays * DAY;
  const t = order.totals;
  const invoiceNumber = `INV-${String(order.invoiceNumber).padStart(4, "0")}`;
  return (
    <Shell>
      <div className="print:hidden">
        <PageHeader
          title={TITLES[kind]}
          backLink={
            <Link to="/orders/$orderId" params={{ orderId: order.id }} className="text-sm text-muted-foreground hover:text-foreground">
              ← Order #{order.number}
            </Link>
          }
          actions={<Button onClick={() => window.print()}>Print</Button>}
        />
      </div>
      <article data-testid="document" className="space-y-6 rounded-lg border border-border bg-card p-6 text-sm text-card-foreground print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{settings.shopName}</div>
            <div className="text-muted-foreground">
              {kind === "invoice" ? `${TITLES.invoice} ${invoiceNumber}` : `${TITLES[kind]} for order #${order.number}`}
            </div>
          </div>
          <dl className="space-y-0.5 text-right">
            <div>
              <dt className="inline text-muted-foreground">Date </dt>
              <dd className="inline">{formatDate(issued)}</dd>
            </div>
            {kind === "invoice" ? (
              <div>
                <dt className="inline text-muted-foreground">Due </dt>
                <dd className="inline">{formatDate(due)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline text-muted-foreground">Order </dt>
              <dd className="inline">#{order.number}</dd>
            </div>
          </dl>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">{kind === "contract" ? "Renter" : "Customer"}</div>
            <div className="font-medium">{order.customer.name}</div>
            {order.customer.email ? <div>{order.customer.email}</div> : null}
            {order.customer.phone ? <div>{order.customer.phone}</div> : null}
            {order.customer.address ? <div className="whitespace-pre-line">{order.customer.address}</div> : null}
          </div>
          <div>
            <div className="text-muted-foreground">Rental period</div>
            <div>{formatDateTime(order.startsAt)}</div>
            <div>{formatDateTime(order.endsAt)}</div>
          </div>
        </div>
        <table className="w-full">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Item</th>
              <th className="py-1 text-right font-normal">Qty</th>
              <th className="py-1 text-right font-normal">Price</th>
              <th className="py-1 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="py-1.5">
                  {l.productName}
                  {kind === "contract" && l.items.length > 0 ? (
                    <span className="text-muted-foreground"> ({l.items.map((i) => i.identifier).join(", ")})</span>
                  ) : null}
                </td>
                <td className="py-1.5 text-right tabular-nums">{l.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">{money(l.unitCents)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(l.lineCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Separator />
        <dl className="ml-auto max-w-xs space-y-1">
          <Line label="Subtotal" value={money(t.subtotalCents)} />
          {t.discountCents > 0 ? <Line label="Discount" value={`−${money(t.discountCents)}`} /> : null}
          {t.depositCents > 0 ? <Line label="Security deposit" value={money(t.depositCents)} /> : null}
          <Line label="Total" value={money(t.totalCents)} strong />
          {kind === "invoice" ? (
            <>
              <Line label="Paid" value={money(t.paidCents)} />
              <Line label="Amount due" value={money(Math.max(0, t.dueCents))} strong />
            </>
          ) : null}
        </dl>
        {kind === "contract" ? (
          <section className="space-y-4">
            <h2 className="font-medium">Terms</h2>
            <p className="whitespace-pre-line">{settings.contractTerms}</p>
            <div className="grid gap-8 pt-8 sm:grid-cols-2">
              <div className="border-t border-border pt-1 text-muted-foreground">Renter signature</div>
              <div className="border-t border-border pt-1 text-muted-foreground">{settings.shopName}</div>
            </div>
          </section>
        ) : null}
      </article>
    </Shell>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 ${strong ? "font-medium" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
