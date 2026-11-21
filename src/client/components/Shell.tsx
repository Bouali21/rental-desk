import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/client/components/AppShell";

const LINKS = [
  { to: "/", label: "Planner" },
  { to: "/orders", label: "Orders" },
  { to: "/products", label: "Products" },
  { to: "/availability", label: "Availability" },
  { to: "/customers", label: "Customers" },
  { to: "/settings", label: "Settings" },
] as const;

/** AppShell with the app's sections in its bar. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <AppShell
      nav={
        <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "font-medium text-foreground" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      }
    >
      {children}
    </AppShell>
  );
}
