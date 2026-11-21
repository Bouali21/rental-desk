// The app's tools for AI clients. The Gateway serves them at /mcp and calls
// each with the signed-in user.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { listProducts } from "@/server/products";
import { viewerFor } from "@/server/viewer";
import { listOrders } from "@/server/orders";

export const tools = defineTools({
  list_products: {
    description: "List rental products with their stock, pricing method and whether they are archived or in the shop.",
    risk: "read",
    input: z.object({ query: z.string().max(200).optional() }).strict(),
    handler: ({ query }) => listProducts(query ?? ""),
  },
  list_orders: {
    description: "List the most recent rental orders the user can see, with customer, period, status and totals. Times are UTC milliseconds.",
    risk: "read",
    input: z
      .object({
        status: z.enum(["all", "draft", "request", "reserved", "picked_up", "returned", "cancelled"]).optional(),
        query: z.string().max(200).optional(),
      })
      .strict(),
    handler: async ({ status, query }, { user }) =>
      listOrders(await viewerFor(user), { status: status ?? "all", q: query ?? "" }),
  },
});
