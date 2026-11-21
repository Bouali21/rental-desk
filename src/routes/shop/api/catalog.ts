import { createFileRoute } from "@tanstack/react-router";
import { catalog } from "@/server/shop";

// Public: published products, their prices and, for a period, free quantities.
export const Route = createFileRoute("/shop/api/catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        return Response.json(await catalog(url.searchParams.get("start"), url.searchParams.get("end")), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
