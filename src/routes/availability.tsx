import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { getAvailability } from "@/serverFunctions/products";

const DAY = 86_400_000;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const Route = createFileRoute("/availability")({
  validateSearch: (search: Record<string, unknown>) => {
    const today = new Date().toISOString().slice(0, 10);
    const from = isDate(search.from) ? search.from : today;
    const to = isDate(search.to) ? search.to : new Date(Date.parse(from) + 6 * DAY).toISOString().slice(0, 10);
    return { from, to };
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAvailability({ data: deps }),
  component: AvailabilityPage,
});

function AvailabilityPage() {
  const grid = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/availability" });
  const [from, setFrom] = useState(search.from);
  const [to, setTo] = useState(search.to);
  function submit(e: FormEvent) {
    e.preventDefault();
    void navigate({ search: { from, to } });
  }
  return (
    <Shell>
      <PageHeader title="Availability" />
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field id="avail-from" label="From">
          <Input id="avail-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field id="avail-to" label="To">
          <Input id="avail-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>
      {grid.products.length === 0 ? (
        <EmptyState title="No products yet" />
      ) : (
        <div className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                {grid.days.map((d) => (
                  <TableHead key={d} className="text-center">
                    {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(d))}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grid.products.map((p) => (
                <TableRow key={p.id} data-testid="avail-row">
                  <TableCell className="font-medium">
                    {p.name}
                    <span className="ml-1 text-muted-foreground">of {p.stock}</span>
                  </TableCell>
                  {grid.days.map((d) => (
                    <TableCell
                      key={d}
                      data-date={d}
                      className={`text-center tabular-nums ${p.free[d] === 0 ? "text-destructive" : ""}`}
                    >
                      {p.free[d]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {grid.days.length === 31 ? <p className="text-sm text-muted-foreground">Showing the first 31 days.</p> : null}
        </div>
      )}
    </Shell>
  );
}
