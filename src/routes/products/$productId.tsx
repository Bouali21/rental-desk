import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { StatusBadge } from "@/client/components/StatusBadge";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { useAction } from "@/client/lib/useAction";
import { formatDateTime, fromCents, toCents } from "@/lib/format";
import {
  addStockItem,
  getProduct,
  setProductArchived,
  setProductQuantity,
  setStockItemRetired,
  updateProductDetails,
  updateProductPricing,
} from "@/serverFunctions/products";

export const Route = createFileRoute("/products/$productId")({
  loader: ({ params }) => getProduct({ data: { id: params.productId } }),
  component: ProductPage,
});

type Loaded = Awaited<ReturnType<typeof getProduct>>;
type Product = NonNullable<Loaded["product"]>;

function ProductPage() {
  const { product, admin } = Route.useLoaderData();
  if (!product) {
    return (
      <Shell>
        <PageHeader title="Product not found" backLink={<BackToProducts />} />
      </Shell>
    );
  }
  return <ProductView key={product.id} product={product} admin={admin} />;
}

function BackToProducts() {
  return (
    <Link to="/products" className="text-sm text-muted-foreground hover:text-foreground">
      ← Products
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}

function ProductView({ product, admin }: { product: Product; admin: boolean }) {
  const archive = useAction();
  return (
    <Shell>
      <PageHeader
        title={product.name}
        backLink={<BackToProducts />}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {product.archived ? <Badge variant="outline">Archived</Badge> : null}
            {product.published && !product.archived ? <Badge variant="secondary">In shop</Badge> : null}
            <span>{product.stock} in stock</span>
          </span>
        }
        actions={
          admin ? (
            <Button
              variant="outline"
              disabled={archive.pending}
              onClick={() =>
                void archive.run(() => setProductArchived({ data: { id: product.id, archived: !product.archived } }))
              }
            >
              {product.archived ? "Restore product" : "Archive product"}
            </Button>
          ) : null
        }
      />
      <ErrorLine error={archive.error} />
      <Details product={product} admin={admin} />
      <ImageSection product={product} admin={admin} />
      <PricingSection product={product} admin={admin} />
      <StockSection product={product} admin={admin} />
      <Section title="Upcoming bookings">
        {product.bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {product.bookings.map((b) => (
              <li key={b.orderId} data-testid="product-booking" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <Link to="/orders/$orderId" params={{ orderId: b.orderId }} className="font-medium hover:underline">
                  #{b.number} · {b.customer}
                </Link>
                <StatusBadge status={b.status} />
                <span className="text-muted-foreground">
                  {formatDateTime(b.startsAt)} – {formatDateTime(b.endsAt)}
                </span>
                <span className="ml-auto">× {b.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Shell>
  );
}

function Details({ product, admin }: { product: Product; admin: boolean }) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [published, setPublished] = useState(product.published);
  const { run, error, pending } = useAction();
  return (
    <Section title="Details">
      <fieldset disabled={!admin} className="space-y-4">
        <Field id="product-name" label="Name">
          <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="product-description" label="Description">
          <Textarea id="product-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox
            id="product-published"
            aria-label="Show in shop"
            checked={published}
            disabled={!admin}
            onCheckedChange={(checked) => setPublished(checked === true)}
          />
          <Label htmlFor="product-published">Show in shop</Label>
        </div>
      </fieldset>
      <ErrorLine error={error} />
      {admin ? (
        <Button
          disabled={pending}
          onClick={() =>
            void run(
              () => updateProductDetails({ data: { id: product.id, name, description, published } }),
              "Details saved",
            )
          }
        >
          Save details
        </Button>
      ) : null}
    </Section>
  );
}

function ImageSection({ product, admin }: { product: Product; admin: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function upload(file: File) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/images/${product.id}`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Upload failed");
      }
      await router.invalidate();
      toast.success("Image saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPending(false);
    }
  }
  if (!admin && !product.imageVersion) return null;
  return (
    <Section title="Image">
      {product.imageVersion ? (
        <img
          data-testid="product-image"
          src={`/api/images/${product.id}?v=${product.imageVersion}`}
          alt={product.name}
          className="max-h-56 rounded-lg border border-border object-contain"
        />
      ) : null}
      {admin ? (
        <Input
          data-testid="image-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={pending}
          className="max-w-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      ) : null}
      <ErrorLine error={error} />
    </Section>
  );
}

type Method = Product["pricingMethod"];

function PricingSection({ product, admin }: { product: Product; admin: boolean }) {
  const [method, setMethod] = useState<Method>(product.pricingMethod);
  const [price, setPrice] = useState(fromCents(product.priceCents));
  const [deposit, setDeposit] = useState(product.depositCents ? fromCents(product.depositCents) : "");
  const [buffer, setBuffer] = useState(String(product.bufferMinutes));
  const [tiers, setTiers] = useState(product.tiers.map((t) => ({ days: String(t.days), price: fromCents(t.priceCents) })));
  const { run, error, setError, pending } = useAction();

  function save() {
    const priceCents = method === "tiered" ? 0 : toCents(price);
    const depositCents = toCents(deposit);
    const parsedTiers = tiers.map((t) => ({ days: Number(t.days), priceCents: toCents(t.price) }));
    if ([priceCents, depositCents, ...parsedTiers.map((t) => t.priceCents)].some(Number.isNaN)) {
      setError("Enter amounts such as 25 or 25.50");
      return;
    }
    void run(
      () =>
        updateProductPricing({
          data: {
            id: product.id,
            pricingMethod: method,
            priceCents,
            depositCents,
            bufferMinutes: Number(buffer) || 0,
            tiers: method === "tiered" ? parsedTiers : [],
          },
        }),
      "Pricing saved",
    );
  }

  return (
    <Section title="Pricing">
      <fieldset disabled={!admin} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pricing-method" label="Charge">
            <NativeSelect id="pricing-method" className="w-full" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              <NativeSelectOption value="fixed">A fixed price per rental</NativeSelectOption>
              <NativeSelectOption value="hourly">Per hour</NativeSelectOption>
              <NativeSelectOption value="daily">Per day</NativeSelectOption>
              <NativeSelectOption value="weekly">Per week</NativeSelectOption>
              <NativeSelectOption value="tiered">By rental length</NativeSelectOption>
            </NativeSelect>
          </Field>
          {method !== "tiered" ? (
            <Field id="price" label="Price">
              <Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          ) : null}
        </div>
        {method === "tiered" ? (
          <div className="space-y-2">
            {tiers.length > 0 ? (
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-sm text-muted-foreground">
                <span>Up to (days)</span>
                <span>Price</span>
                <span />
              </div>
            ) : null}
            {tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  data-testid="tier-days"
                  aria-label="Days"
                  type="number"
                  min={1}
                  value={t.days}
                  onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))}
                />
                <Input
                  data-testid="tier-price"
                  aria-label="Price"
                  inputMode="decimal"
                  value={t.price}
                  onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                />
                <Button variant="ghost" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            {admin ? (
              <Button variant="outline" size="sm" onClick={() => setTiers([...tiers, { days: "", price: "" }])}>
                Add tier
              </Button>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Rentals longer than the last tier cost its daily rate for each extra day.
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="deposit" label="Security deposit">
            <Input id="deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
          <Field id="buffer" label="Buffer before and after (minutes)">
            <Input id="buffer" type="number" min={0} value={buffer} onChange={(e) => setBuffer(e.target.value)} />
          </Field>
        </div>
      </fieldset>
      <ErrorLine error={error} />
      {admin ? (
        <Button disabled={pending} onClick={save}>
          Save pricing
        </Button>
      ) : null}
    </Section>
  );
}

function StockSection({ product, admin }: { product: Product; admin: boolean }) {
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [identifier, setIdentifier] = useState("");
  const { run, error, pending } = useAction();
  if (product.tracking === "bulk") {
    return (
      <Section title="Stock">
        <Field id="stock-quantity" label="Quantity" className="max-w-48">
          <Input
            id="stock-quantity"
            type="number"
            min={0}
            disabled={!admin}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <ErrorLine error={error} />
        {admin ? (
          <Button
            disabled={pending}
            onClick={() => void run(() => setProductQuantity({ data: { id: product.id, quantity: Number(quantity) } }), "Stock saved")}
          >
            Save stock
          </Button>
        ) : null}
      </Section>
    );
  }
  return (
    <Section title="Stock items">
      {product.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {product.items.map((item) => (
            <li key={item.id} data-testid="stock-item" className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="font-mono">{item.identifier}</span>
              {item.retired ? <Badge variant="outline">Retired</Badge> : null}
              {admin ? (
                <Button
                  className="ml-auto"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => void run(() => setStockItemRetired({ data: { id: item.id, retired: !item.retired } }))}
                >
                  {item.retired ? "Return to stock" : "Retire"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {admin ? (
        <form
          className="flex max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => addStockItem({ data: { productId: product.id, identifier } })).then((ok) => {
              if (ok) setIdentifier("");
            });
          }}
        >
          <Input
            id="new-item"
            aria-label="Identifier"
            placeholder="Serial number or tag"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <Button type="submit" disabled={pending}>
            Add item
          </Button>
        </form>
      ) : null}
      <ErrorLine error={error} />
    </Section>
  );
}
