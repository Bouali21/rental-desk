import type { ReactNode } from "react";
import { Label } from "@/client/components/ui/label";

/** A label over its control. */
export function Field({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
