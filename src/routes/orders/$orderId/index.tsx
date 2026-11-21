import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Field } from "@/client/components/Field";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { LateBadge, StatusBadge } from "@/client/components/StatusBadge";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { messageOf, useAction } from "@/client/lib/useAction";
import { formatDate, formatDateTime, formatMoney, fromCents, PAYMENT_STATUS_LABELS, toCents, toLocal } from "@/lib/format";
import {
  addOrderLine,
  changeOrderStatus,
  deleteDraftOrder,
  deletePayment,
  getOrder,
  getPickupOptions,
  pickUpOrder,
  recordPayment,
  removeOrderLine,
  setOrderDiscount,
  updateOrderLine,
  updateOrderPeriod,
} from "@/serverFunctions/orders";

export const Route = createFileRoute("/orders/$orderId/")({
  loader: ({ params }) => getOrder({ data: { id: params.orderId } }),
  component: OrderPage,
});

type Data = Awaited<ReturnType<typeof getOrder>>;
type Order = NonNullable<Data["order"]>;
type Action = ReturnType<typeof useAction>;

function Back() {
  return (
    <Link to="/orders" className="text-sm text-muted-foreground hover:text-foreground">
      ← Orders
    </Link>
  );
}

function OrderPage() {
  const data = Route.useLoaderData();
  if (!data.order) {
    return (
      <Shell>
        <PageHeader title="Order not found" backLink={<Back />} />
      </Shell>
    );
  }
  return <OrderView key={data.order.id} order={data.order} products={data.products} currency={data.settings.currency} />;
}

function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function OrderView({ order, products, currency }: { order: Order; products: { id: string; name: string }[]; currency: string }) {
  const action = useAction();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<null | "pickup" | "payment" | "cancel" | "delete">(null);
  const money = (cents: number) => formatMoney(cents, currency);
  const status = (a: "reserve" | "approve" | "decline" | "cancel" | "return") =>
    action.run(() => changeOrderStatus({ data: { id: order.id, action: a } }));

  const buttons: ReactNode[] = [];
  if (order.status === "draft") buttons.push(<Button key="r" onClick={() => void status("reserve")} disabled={action.pending}>Reserve</Button>);
  if (order.status === "request") {
    buttons.push(<Button key="a" onClick={() => void status("approve")} disabled={action.pending}>Approve</Button>);
    buttons.push(<Button key="d" variant="outline" onClick={() => void status("decline")} disabled={action.pending}>Decline</Button>);
  }
  if (order.status === "reserved") buttons.push(<Button key="p" onClick={() => setDialog("pickup")}>Pick up</Button>);
  if (order.status === "picked_up") buttons.push(<Button key="ret" onClick={() => void status("return")} disabled={action.pending}>Return</Button>);
  if (order.status === "draft" || order.status === "reserved")
    buttons.push(<Button key="c" variant="outline" onClick={() => setDialog("cancel")}>Cancel order</Button>);
  if (order.deletable) buttons.push(<Button key="del" variant="ghost" onClick={() => setDialog("delete")}>Delete draft</Button>);

  return (
    <Shell>
      <PageHeader
        title={`Order #${order.number}`}
        backLink={<Back />}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} testId="order-status" />
            {order.late ? <LateBadge /> : null}
            <Link to="/customers/$customerId" params={{ customerId: order.customer.id }} className="hover:underline">
              {order.customer.name}
            </Link>
            {order.fromShop ? <Badge variant="outline">Booked online</Badge> : null}
          </span>
        }
        actions={buttons}
      />
      {action.error ? (
        <Alert variant="destructive" data-testid="order-error">
          <AlertDescription>{action.error}</AlertDescription>
        </Alert>
      ) : null}

      <Period order={order} action={action} />
      <Lines order={order} products={products} action={action} money={money} />
      <Totals order={order} action={action} money={money} />
      <Payments order={order} action={action} money={money} onRecord={() => setDialog("payment")} />

      <Section title="Documents">
        <div className="flex flex-wrap gap-2">
          {(["quote", "contract", "invoice"] as const).map((doc) => (
            <Button key={doc} variant="outline" render={<Link to="/orders/$orderId/$document" params={{ orderId: order.id, document: doc }} />}>
              {doc.charAt(0).toUpperCase() + doc.slice(1)}
            </Button>
          ))}
        </div>
      </Section>

      {dialog === "pickup" ? <PickupDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === "payment" ? <PaymentDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === "cancel" ? (
        <ConfirmDialog
          title="Cancel this order?"
          confirmLabel="Cancel order"
          destructive
          pending={action.pending}
          onClose={() => setDialog(null)}
          onConfirm={() => void status("cancel").then(() => setDialog(null))}
        >
          Its stock is released.
        </ConfirmDialog>
      ) : null}
      {dialog === "delete" ? (
        <ConfirmDialog
          title="Delete this draft?"
          confirmLabel="Delete draft"
          destructive
          pending={action.pending}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void action.run(() => deleteDraftOrder({ data: { id: order.id } })).then((ok) => {
              setDialog(null);
              if (ok) void navigate({ to: "/orders" });
            })
          }
        />
      ) : null}
    </Shell>
  );
}

function Period({ order, action }: { order: Order; action: Action }) {
  const [start, setStart] = useState(toLocal(order.startsAt));
  const [end, setEnd] = useState(toLocal(order.endsAt));
  if (!order.editable) {
    return (
      <Section title="Rental period">
        <p className="text-sm">
          {formatDateTime(order.startsAt)} – {formatDateTime(order.endsAt)}
        </p>
      </Section>
    );
  }
  return (
    <Section title="Rental period">
      <div className="flex flex-wrap items-end gap-3">
        <Field id="order-start" label="Pickup">
          <Input id="order-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field id="order-end" label="Return">
          <Input id="order-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Button
          variant="outline"
          disabled={action.pending}
          onClick={() => void action.run(() => updateOrderPeriod({ data: { id: order.id, start, end } }), "Dates saved")}
        >
          Save dates
        </Button>
      </div>
    </Section>
  );
}

function Lines({
  order,
  products,
  action,
  money,
}: {
  order: Order;
  products: { id: string; name: string }[];
  action: Action;
  money: (c: number) => string;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  return (
    <Section title="Products">
      {order.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products on this order yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {order.lines.map((line) => (
            <LineRow key={`${line.id}-${line.quantity}`} line={line} editable={order.editable} action={action} money={money} />
          ))}
        </ul>
      )}
      {order.editable ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field id="line-product" label="Product" className="min-w-48 flex-1">
            <NativeSelect id="line-product" className="w-full" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <NativeSelectOption value="">Pick a product</NativeSelectOption>
              {products.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="line-quantity" label="Quantity" className="w-24">
            <Input id="line-quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Button
            disabled={action.pending}
            onClick={() =>
              void action
                .run(() => addOrderLine({ data: { orderId: order.id, productId, quantity: Number(quantity) } }))
                .then((ok) => {
                  if (ok) {
                    setProductId("");
                    setQuantity("1");
                  }
                })
            }
          >
            Add line
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

function LineRow({
  line,
  editable,
  action,
  money,
}: {
  line: Order["lines"][number];
  editable: boolean;
  action: Action;
  money: (c: number) => string;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  return (
    <li data-testid="order-line" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{line.productName}</div>
        <div className="text-muted-foreground">
          {money(line.unitCents)} each
          {line.depositCents > 0 ? ` · deposit ${money(line.depositCents)}` : ""}
          {line.items.length > 0 ? ` · ${line.items.map((i) => i.identifier).join(", ")}` : ""}
        </div>
      </div>
      {editable ? (
        <div className="flex items-center gap-2">
          <Input aria-label="Quantity" type="number" min={1} className="w-20" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Button
            variant="outline"
            size="sm"
            disabled={action.pending || quantity === String(line.quantity)}
            onClick={() => void action.run(() => updateOrderLine({ data: { lineId: line.id, quantity: Number(quantity) } }))}
          >
            Update
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={action.pending}
            onClick={() => void action.run(() => removeOrderLine({ data: { lineId: line.id } }))}
          >
            Remove
          </Button>
        </div>
      ) : (
        <span>× {line.quantity}</span>
      )}
      <span className="w-24 text-right tabular-nums">{money(line.lineCents)}</span>
    </li>
  );
}

function Totals({ order, action, money }: { order: Order; action: Action; money: (c: number) => string }) {
  const [type, setType] = useState(order.discountType);
  const [value, setValue] = useState(
    order.discountType === "fixed" ? fromCents(order.discountValue) : order.discountType === "percent" ? String(order.discountValue) : "",
  );
  const t = order.totals;
  function saveDiscount() {
    const amount = type === "fixed" ? toCents(value) : type === "percent" ? Number(value) : 0;
    if (Number.isNaN(amount) || !Number.isInteger(amount)) {
      action.setError(type === "percent" ? "Enter a whole percentage" : "Enter an amount such as 25 or 25.50");
      return;
    }
    void action.run(() => setOrderDiscount({ data: { id: order.id, type, value: amount } }));
  }
  return (
    <Section title="Totals">
      {order.discountEditable ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field id="discount-type" label="Discount">
            <NativeSelect id="discount-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <NativeSelectOption value="none">None</NativeSelectOption>
              <NativeSelectOption value="percent">Percentage</NativeSelectOption>
              <NativeSelectOption value="fixed">Amount</NativeSelectOption>
            </NativeSelect>
          </Field>
          {type !== "none" ? (
            <Field id="discount-value" label={type === "percent" ? "Percent" : "Amount"} className="w-28">
              <Input id="discount-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          ) : null}
          <Button variant="outline" disabled={action.pending} onClick={saveDiscount}>
            Save discount
          </Button>
        </div>
      ) : null}
      <dl className="ml-auto max-w-xs space-y-1 text-sm">
        <Row label="Subtotal" value={money(t.subtotalCents)} testId="total-subtotal" />
        {t.discountCents > 0 ? <Row label="Discount" value={`−${money(t.discountCents)}`} testId="total-discount" /> : null}
        {t.depositCents > 0 ? <Row label="Deposit" value={money(t.depositCents)} testId="total-deposit" /> : null}
        <Row label="Total" value={money(t.totalCents)} testId="total-total" strong />
      </dl>
    </Section>
  );
}

function Row({ label, value, testId, strong }: { label: string; value: ReactNode; testId: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 ${strong ? "font-medium" : ""}`} data-testid={testId}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Payments({
  order,
  action,
  money,
  onRecord,
}: {
  order: Order;
  action: Action;
  money: (c: number) => string;
  onRecord: () => void;
}) {
  const t = order.totals;
  return (
    <Section
      title="Payments"
      actions={
        order.status !== "draft" ? (
          <Button variant="outline" size="sm" onClick={onRecord}>
            Record payment
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant={t.paymentStatus === "paid" ? "secondary" : "outline"} data-testid="payment-status">
          {PAYMENT_STATUS_LABELS[t.paymentStatus]}
        </Badge>
        <span data-testid="total-due">
          {t.dueCents >= 0 ? `Due ${money(t.dueCents)}` : `Overpaid by ${money(-t.dueCents)}`}
        </span>
        <span className="text-muted-foreground">Paid {money(t.paidCents)}</span>
      </div>
      {order.payments.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {order.payments.map((p) => (
            <li key={p.id} data-testid="payment-row" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
              <span>{formatDate(Date.parse(`${p.paidOn}T00:00:00Z`))}</span>
              <span className="font-medium">{p.kind === "refund" ? "Refund" : "Payment"}</span>
              {p.method ? <span className="text-muted-foreground">{p.method}</span> : null}
              {p.note ? <span className="text-muted-foreground">{p.note}</span> : null}
              <span className="ml-auto tabular-nums">{p.kind === "refund" ? `−${money(p.amountCents)}` : money(p.amountCents)}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={action.pending}
                onClick={() => void action.run(() => deletePayment({ data: { id: p.id } }))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function PaymentDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const [kind, setKind] = useState<"payment" | "refund">("payment");
  const [amount, setAmount] = useState(order.totals.dueCents > 0 ? fromCents(order.totals.dueCents) : "");
  const [method, setMethod] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const { run, error, setError, pending } = useAction();
  function save() {
    const amountCents = toCents(amount);
    if (Number.isNaN(amountCents)) {
      setError("Enter an amount such as 25 or 25.50");
      return;
    }
    void run(() => recordPayment({ data: { orderId: order.id, kind, amountCents, method, paidOn, note } }), "Payment saved").then(
      (ok) => ok && onClose(),
    );
  }
  return (
    <FormDialog
      title="Record payment"
      onClose={onClose}
      actions={
        <Button onClick={save} disabled={pending}>
          Save payment
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="payment-kind" label="Type">
            <NativeSelect id="payment-kind" className="w-full" value={kind} onChange={(e) => setKind(e.target.value as "payment" | "refund")}>
              <NativeSelectOption value="payment">Payment</NativeSelectOption>
              <NativeSelectOption value="refund">Refund</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field id="payment-amount" label="Amount">
            <Input id="payment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field id="payment-method" label="Method">
            <Input id="payment-method" placeholder="Cash, card, transfer" value={method} onChange={(e) => setMethod(e.target.value)} />
          </Field>
          <Field id="payment-date" label="Date">
            <Input id="payment-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
        <Field id="payment-note" label="Note">
          <Input id="payment-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </FormDialog>
  );
}

type PickupOption = Awaited<ReturnType<typeof getPickupOptions>>[number];

function PickupDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const [options, setOptions] = useState<PickupOption[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const { run, error, setError, pending } = useAction();
  useEffect(() => {
    getPickupOptions({ data: { id: order.id } })
      .then((loaded) => {
        setOptions(loaded);
        setChosen(Object.fromEntries(loaded.map((o) => [o.lineId, o.items.slice(0, o.quantity).map((i) => i.id)])));
      })
      .catch((e: unknown) => setError(messageOf(e)));
  }, [order.id, setError]);
  function toggle(lineId: string, itemId: string, on: boolean) {
    setChosen((c) => ({
      ...c,
      [lineId]: on ? [...(c[lineId] ?? []), itemId] : (c[lineId] ?? []).filter((id) => id !== itemId),
    }));
  }
  return (
    <FormDialog
      title="Pick up"
      onClose={onClose}
      actions={
        <Button
          disabled={pending || options === null}
          onClick={() =>
            void run(
              () =>
                pickUpOrder({
                  data: {
                    id: order.id,
                    assignments: Object.entries(chosen).map(([lineId, stockItemIds]) => ({ lineId, stockItemIds })),
                  },
                }),
            ).then((ok) => ok && onClose())
          }
        >
          Confirm pickup
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
        {options === null && !error ? <p className="text-muted-foreground">Loading…</p> : null}
        {options?.map((o) => (
          <fieldset key={o.lineId} className="space-y-2">
            <legend className="font-medium">
              {o.productName}: pick {o.quantity}
            </legend>
            {o.items.length === 0 ? <p className="text-muted-foreground">No items are free for this period.</p> : null}
            {o.items.map((item) => (
              <label key={item.id} className="flex items-center gap-2">
                <Checkbox
                  aria-label={item.identifier}
                  checked={(chosen[o.lineId] ?? []).includes(item.id)}
                  onCheckedChange={(on) => toggle(o.lineId, item.id, on === true)}
                />
                <span className="font-mono">{item.identifier}</span>
              </label>
            ))}
          </fieldset>
        ))}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </FormDialog>
  );
}
