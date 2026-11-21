import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import { Shell } from "@/client/components/Shell";
import { OrderList, type OrderSummary } from "@/client/components/OrderList";
import { getPlanner } from "@/serverFunctions/orders";

export const Route = createFileRoute("/")({
  loader: () => getPlanner(),
  component: Planner,
});

function Planner() {
  const { planner, currency } = Route.useLoaderData();
  const sections: { id: string; title: string; orders: OrderSummary[]; when: "pickup" | "return"; empty: string }[] = [
    { id: "late-returns", title: "Late returns", orders: planner.late, when: "return", empty: "Nothing is overdue." },
    { id: "pickups-today", title: "Pickups today", orders: planner.pickupsToday, when: "pickup", empty: "No pickups today." },
    { id: "returns-today", title: "Returns today", orders: planner.returnsToday, when: "return", empty: "No returns today." },
    { id: "upcoming-pickups", title: "Pickups this week", orders: planner.upcomingPickups, when: "pickup", empty: "No pickups this week." },
    { id: "upcoming-returns", title: "Returns this week", orders: planner.upcomingReturns, when: "return", empty: "No returns this week." },
  ];
  if (planner.requests.length > 0) {
    sections.unshift({ id: "requests", title: "Requests to review", orders: planner.requests, when: "pickup", empty: "" });
  }
  return (
    <Shell>
      <PageHeader title="Planner" />
      {sections.map((s) => (
        <section key={s.id} data-testid={s.id} className="space-y-3">
          <h2 className="text-sm font-medium">
            {s.title}
            {s.orders.length > 0 ? <span className="ml-2 text-muted-foreground">{s.orders.length}</span> : null}
          </h2>
          {s.orders.length > 0 ? (
            <OrderList orders={s.orders} currency={currency} when={s.when} testId="planner-row" />
          ) : (
            <p className="text-sm text-muted-foreground">{s.empty}</p>
          )}
        </section>
      ))}
    </Shell>
  );
}
