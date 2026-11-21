import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CustomerFields } from "@/client/components/CustomerFields";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { LateBadge, StatusBadge } from "@/client/components/StatusBadge";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { useAction } from "@/client/lib/useAction";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getCustomer, setCustomerArchived, updateCustomer } from "@/serverFunctions/customers";

export const Route = createFileRoute("/customers/$customerId")({
  loader: ({ params }) => getCustomer({ data: { id: params.customerId } }),
  component: CustomerPage,
});

function Back() {
  return (
    <Link to="/customers" search={{ archived: false }} className="text-sm text-muted-foreground hover:text-foreground">
      ← Customers
    </Link>
  );
}

function CustomerPage() {
  const { customer, currency } = Route.useLoaderData();
  if (!customer) {
    return (
      <Shell>
        <PageHeader title="Customer not found" backLink={<Back />} />
      </Shell>
    );
  }
  return <CustomerView key={customer.id} customer={customer} currency={currency} />;
}

type Customer = NonNullable<Awaited<ReturnType<typeof getCustomer>>["customer"]>;

function CustomerView({ customer, currency }: { customer: Customer; currency: string }) {
  const [form, setForm] = useState({
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
  });
  const save = useAction();
  const archive = useAction();
  return (
    <Shell>
      <PageHeader
        title={customer.name}
        backLink={<Back />}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {customer.archived ? <Badge variant="outline">Archived</Badge> : null}
            <span data-testid="customer-balance">Balance due {formatMoney(customer.balanceCents, currency)}</span>
          </span>
        }
        actions={
          <Button
            variant="outline"
            disabled={archive.pending}
            onClick={() => void archive.run(() => setCustomerArchived({ data: { id: customer.id, archived: !customer.archived } }))}
          >
            {customer.archived ? "Restore customer" : "Archive customer"}
          </Button>
        }
      />
      {archive.error ? (
        <Alert variant="destructive">
          <AlertDescription>{archive.error}</AlertDescription>
        </Alert>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Orders</h2>
        {customer.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {customer.orders.map((o) => (
              <li key={o.id} data-testid="customer-order" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <Link to="/orders/$orderId" params={{ orderId: o.id }} className="font-medium hover:underline">
                  #{o.number}
                </Link>
                <StatusBadge status={o.status} />
                {o.late ? <LateBadge /> : null}
                <span className="text-muted-foreground">
                  {formatDateTime(o.startsAt)} – {formatDateTime(o.endsAt)}
                </span>
                <span className="ml-auto tabular-nums">{formatMoney(o.totalCents, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Details</h2>
        <CustomerFields value={form} onChange={setForm} />
        {save.error ? (
          <Alert variant="destructive">
            <AlertDescription>{save.error}</AlertDescription>
          </Alert>
        ) : null}
        <Button disabled={save.pending} onClick={() => void save.run(() => updateCustomer({ data: { id: customer.id, ...form } }), "Customer saved")}>
          Save customer
        </Button>
      </section>
    </Shell>
  );
}
