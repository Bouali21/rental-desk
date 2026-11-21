import { Badge } from "@/client/components/ui/badge";
import { STATUS_LABELS } from "@/lib/format";

type Status = keyof typeof STATUS_LABELS;

const VARIANTS: Record<Status, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  request: "secondary",
  reserved: "default",
  picked_up: "secondary",
  returned: "outline",
  cancelled: "outline",
};

export function StatusBadge({ status, testId }: { status: Status; testId?: string }) {
  return (
    <Badge variant={VARIANTS[status]} data-testid={testId}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function LateBadge() {
  return (
    <Badge variant="destructive" data-testid="late-badge">
      Late
    </Badge>
  );
}
