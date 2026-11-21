import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, Users } from "lucide-react";
import { useState } from "react";
import { CustomerFields, EMPTY_CUSTOMER } from "@/client/components/CustomerFields";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Shell } from "@/client/components/Shell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { useAction } from "@/client/lib/useAction";
import { createCustomer, listCustomers } from "@/serverFunctions/customers";

export const Route = createFileRoute("/customers/")({
  validateSearch: (search: Record<string, unknown>) => ({
    archived: search.archived === true || search.archived === "true",
  }),
  loaderDeps: ({ search }) => ({ archived: search.archived }),
  loader: ({ deps }) => listCustomers({ data: { q: "", archived: deps.archived } }),
  component: CustomersPage,
});

function CustomersPage() {
  const customers = Route.useLoaderData();
  const { archived } = Route.useSearch();
  const navigate = useNavigate({ from: "/customers/" });
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const term = q.trim().toLowerCase();
  const shown = term
    ? customers.filter((c) => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(term))
    : customers;
  return (
    <Shell>
      <PageHeader title="Customers" actions={<Button onClick={() => setCreating(true)}>New customer</Button>} />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          data-testid="customer-search"
          placeholder="Search customers"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <SegmentedToggle
          value={archived ? "archived" : "active"}
          onChange={(v) => void navigate({ search: { archived: v === "archived" } })}
          showLabels
          items={[
            { value: "active", label: "Active", icon: <Users className="size-4" aria-hidden /> },
            { value: "archived", label: "Archived", icon: <Archive className="size-4" aria-hidden /> },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        term ? (
          <EmptyState kind="filtered" title="No matching customers" />
        ) : (
          <EmptyState
            title={archived ? "No archived customers" : "No customers yet"}
            description={archived ? undefined : "Add one here, or they're added when someone books online."}
          />
        )
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {shown.map((c) => (
            <li key={c.id} data-testid="customer-row" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <Link to="/customers/$customerId" params={{ customerId: c.id }} className="font-medium hover:underline">
                {c.name}
              </Link>
              <span className="text-muted-foreground">{c.email}</span>
              <span className="ml-auto text-muted-foreground">{c.phone}</span>
            </li>
          ))}
        </ul>
      )}
      {creating ? <NewCustomerDialog onClose={() => setCreating(false)} /> : null}
    </Shell>
  );
}

function NewCustomerDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_CUSTOMER);
  const { run, error, pending } = useAction();
  async function submit() {
    let id = "";
    const ok = await run(async () => {
      id = (await createCustomer({ data: form })).id;
    });
    if (ok) await navigate({ to: "/customers/$customerId", params: { customerId: id } });
  }
  return (
    <FormDialog
      title="New customer"
      onClose={onClose}
      actions={
        <Button onClick={() => void submit()} disabled={pending}>
          Create customer
        </Button>
      }
    >
      <CustomerFields value={form} onChange={setForm} />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </FormDialog>
  );
}
