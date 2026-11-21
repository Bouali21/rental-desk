import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

/** The message to show for a failed server call. */
export function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.startsWith("[")) {
    try {
      const issues = JSON.parse(raw) as { message?: string }[];
      if (issues[0]?.message) return issues[0].message;
    } catch {
      // not a list of validation issues
    }
  }
  return raw || "Something went wrong";
}

/**
 * Runs a change, then reloads the page's data. A failure is kept in `error`
 * for the page to show; success can toast.
 */
export function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function run(work: () => Promise<unknown>, success?: string): Promise<boolean> {
    setError(null);
    setPending(true);
    try {
      await work();
      await router.invalidate();
      if (success) toast.success(success);
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    } finally {
      setPending(false);
    }
  }
  return { run, error, setError, pending };
}
