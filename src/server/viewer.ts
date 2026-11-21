import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { refuse } from "./refuse";

/** The signed-in member as the app sees them. */
export interface Viewer {
  id: string;
  email: string;
  admin: boolean;
}

export async function viewerFor(user: EveryAppUser): Promise<Viewer> {
  // App records are keyed by the Gateway's user id, created on first sight.
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: sql`excluded.email` },
      setWhere: sql`${users.email} <> excluded.email`,
    });
  return { id: user.id, email: user.email, admin: isAdmin(user) };
}

export function requireAdmin(viewer: Viewer): void {
  if (!viewer.admin) refuse(403, "Only admins can do this.");
}
