import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { useAction } from "@/client/lib/useAction";
import { priceLabel } from "@/lib/format";
import { createProduct, listProducts } from "@/serverFunctions/products";

export const Route = createFileRoute("/products/")({
  loader: () => listProducts({ data: { q: "" } }),
  component: ProductsPage,
});

function ProductsPage() {
  const { products, currency, admin } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const term = q.trim().toLowerCase();
  const shown = term
    ? products.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(term))
    : products;

  return (
    <Shell>
      <PageHeader
        title="Products"
        actions={admin ? <Button onClick={() => setCreating(true)}>New product</Button> : null}
      />
      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description={admin ? "Add what you rent out and it will appear here." : "An admin adds products."}
        />
      ) : (
        <div className="space-y-4">
          <Input
            data-testid="product-search"
            placeholder="Search products"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          {shown.length === 0 ? (
            <EmptyState kind="filtered" title="No matching products" />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {shown.map((p) => (
                <li key={p.id} data-testid="product-row" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <Link to="/products/$productId" params={{ productId: p.id }} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.archived ? <Badge variant="outline">Archived</Badge> : null}
                  {p.published && !p.archived ? <Badge variant="secondary">In shop</Badge> : null}
                  <span className="text-muted-foreground">{p.stock} in stock</span>
                  <span className="ml-auto text-muted-foreground">
                    {p.pricingMethod === "tiered" ? "Tiered" : priceLabel(p.pricingMethod, p.priceCents, [], currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {creating ? <NewProductDialog onClose={() => setCreating(false)} /> : null}
    </Shell>
  );
}

function NewProductDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tracking, setTracking] = useState<"bulk" | "trackable">("bulk");
  const { run, error, pending } = useAction();
  let createdId = "";
  async function submit() {
    const ok = await run(async () => {
      createdId = (await createProduct({ data: { name, description, tracking } })).id;
    });
    if (ok) await navigate({ to: "/products/$productId", params: { productId: createdId } });
  }
  return (
    <FormDialog
      title="New product"
      onClose={onClose}
      actions={
        <Button onClick={() => void submit()} disabled={pending}>
          Create product
        </Button>
      }
    >
      <div className="space-y-4">
        <Field id="product-name" label="Name">
          <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="product-description" label="Description">
          <Textarea id="product-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field id="product-tracking" label="Stock">
          <NativeSelect
            id="product-tracking"
            className="w-full"
            value={tracking}
            onChange={(e) => setTracking(e.target.value as "bulk" | "trackable")}
          >
            <NativeSelectOption value="bulk">A quantity</NativeSelectOption>
            <NativeSelectOption value="trackable">Individual items with identifiers</NativeSelectOption>
          </NativeSelect>
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
