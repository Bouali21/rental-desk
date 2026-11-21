import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { FormDialog } from "@/client/components/FormDialog";
import { OrderList } from "@/client/components/OrderList";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { useAction } from "@/client/lib/useAction";
import { STATUS_LABELS } from "@/lib/format";
import { createOrder, listOrders } from "@/serverFunctions/orders";

export const Route = createFileRoute("/orders/")({
  loader: () => listOrders({ data: { status: "all", q: "" } }),
  component: OrdersPage,
});

function OrdersPage() {
  const { orders, customers, currency } = Route.useLoaderData();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const term = q.trim().toLowerCase().replace(/^#/, "");
  const shown = orders.filter(
    (o) =>
      (status === "all" || o.status === status) &&
      (!term || String(o.number) === term || o.customerName.toLowerCase().includes(term)),
  );
  return (
    <Shell>
      <PageHeader title="Orders" actions={<Button onClick={() => setCreating(true)}>New order</Button>} />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Start one here, or they arrive from the booking page." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              data-testid="order-search"
              placeholder="Order number or customer"
              aria-label="Search orders"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
            />
            <NativeSelect id="status-filter" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <NativeSelectOption value="all">All statuses</NativeSelectOption>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {shown.length === 0 ? (
            <EmptyState kind="filtered" title="No matching orders" />
          ) : (
            <OrderList orders={shown} currency={currency} when="period" />
          )}
        </div>
      )}
      {creating ? <NewOrderDialog customers={customers} onClose={() => setCreating(false)} /> : null}
    </Shell>
  );
}

function NewOrderDialog({ customers, onClose }: { customers: { id: string; name: string }[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const { run, error, pending } = useAction();
  async function submit() {
    let id = "";
    const ok = await run(async () => {
      id = (await createOrder({ data: { customerId, start, end } })).id;
    });
    if (ok) await navigate({ to: "/orders/$orderId", params: { orderId: id } });
  }
  return (
    <FormDialog
      title="New order"
      onClose={onClose}
      actions={
        <Button onClick={() => void submit()} disabled={pending}>
          Create order
        </Button>
      }
    >
      <div className="space-y-4">
        {customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a customer first.</p>
        ) : null}
        <Field id="order-customer" label="Customer">
          <NativeSelect id="order-customer" className="w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <NativeSelectOption value="">Pick a customer</NativeSelectOption>
            {customers.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="order-start" label="Pickup">
            <Input id="order-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field id="order-end" label="Return">
            <Input id="order-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </FormDialog>
  );
}
