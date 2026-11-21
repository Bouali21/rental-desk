import type { ReactNode } from "react";

/** The booking page's frame: no app bar, since visitors aren't members. */
export function ShopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-y-auto">
      <main className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-10 pb-24 md:px-10">{children}</main>
    </div>
  );
}
