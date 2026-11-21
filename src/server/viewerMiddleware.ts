import { createMiddleware } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { viewerFor } from "./viewer";

/** ensureUserMiddleware, plus `context.viewer`. */
export const viewerMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context }) =>
    next({ context: { viewer: await viewerFor(context.user) } }),
  );

