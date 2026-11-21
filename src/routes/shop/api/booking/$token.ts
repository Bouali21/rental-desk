import { createFileRoute } from "@tanstack/react-router";
import { booking } from "@/server/shop";

// Public: one booking's confirmation, found only by its unguessable token.
export const Route = createFileRoute("/shop/api/booking/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const found = await booking(params.token);
        if (!found) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json(found, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
